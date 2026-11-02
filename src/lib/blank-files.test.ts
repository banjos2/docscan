import { existsSync, readdirSync, readFileSync } from "node:fs"
import { decodePDFRawStream, PDFCheckBox, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRadioGroup, PDFRawStream, PDFString, PDFTextField } from "pdf-lib"
import { expect, test } from "vitest"

const DIR = new URL("../../public/blanks/", import.meta.url)

// Font size in a /DA string such as "/Helv 8 Tf 0 g"; 0 means automatic. No DA at all counts as automatic.
const daSize = (d: PDFDict) => {
  const da = d.lookup(PDFName.of("DA"))
  return da instanceof PDFString || da instanceof PDFHexString ? Number(da.decodeText().match(/([\d.]+)\s+Tf/)?.[1] ?? 0) : 0
}

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".pdf"))) {
  test(`${file} carries no applicant data or metadata`, async () => {
    const doc = await PDFDocument.load(readFileSync(new URL(file, DIR)), { updateMetadata: false })
    // No document info at all, not even dates. (pdf-lib's getAuthor() and the like would add an empty one.)
    expect(doc.context.trailerInfo.Info).toBeUndefined()
    expect(doc.catalog.get(PDFName.of("Metadata"))).toBeUndefined()
    const form = doc.getForm()
    expect(form.acroForm.dict.get(PDFName.of("XFA"))).toBeUndefined()
    for (const f of form.getFields()) {
      if (f instanceof PDFTextField) expect(f.getText() ?? "").toBe("")
      if (f instanceof PDFCheckBox) expect(f.isChecked()).toBe(false)
      if (f instanceof PDFRadioGroup) expect(f.getSelected()).toBeUndefined()
    }
  })

  // The customer's forms use automatic size, 8 pt (Polish) or 12 pt (Bulgarian). The auto-size pdf-lib writes into the
  // DA when it redraws an emptied field follows the widget height instead (98 pt in a tall box) and overflows when filled.
  test(`${file} keeps the form's own text sizes`, async () => {
    const doc = await PDFDocument.load(readFileSync(new URL(file, DIR)), { updateMetadata: false })
    for (const f of doc.getForm().getFields()) {
      if (!(f instanceof PDFTextField)) continue
      for (const d of [f.acroField.dict, ...f.acroField.getWidgets().map((w) => w.dict)]) expect(daSize(d)).toBeLessThanOrEqual(14)
    }
  })

  // A box of a form made from Word is printed by the blank; its widget draws the check mark only, filled, and no frame.
  // (pdf-lib's own appearances stroke a hairline round every box, offset from the printed one.)
  if (existsSync(new URL(`../../blanks-src/${file.replace(/\.pdf$/, ".docx")}`, import.meta.url)))
    test(`${file} draws no frame round its boxes`, async () => {
      const doc = await PDFDocument.load(readFileSync(new URL(file, DIR)), { updateMetadata: false })
      const boxes = doc.getForm().getFields().filter((f) => f instanceof PDFCheckBox)
      expect(boxes.length).toBeGreaterThan(0)
      for (const f of boxes)
        for (const w of f.acroField.getWidgets()) {
          const { normal, down } = w.getAppearances() ?? {}
          for (const look of [normal, down]) {
            const streams = look instanceof PDFDict ? look.values().map((v) => doc.context.lookup(v)) : [look]
            for (const s of streams) {
              expect(s, f.getName()).toBeInstanceOf(PDFRawStream)
              const ops = new TextDecoder().decode(decodePDFRawStream(s as PDFRawStream).decode())
              expect(ops, f.getName()).not.toMatch(/(^|\s)[Ss](\s|$)/)
            }
          }
        }
    })

  // The filler writes "/Helv … Tf" into a field's DA; a viewer redrawing the field finds that font in the form's /DR.
  test(`${file} has Helvetica as /Helv in its form resources`, async () => {
    const doc = await PDFDocument.load(readFileSync(new URL(file, DIR)), { updateMetadata: false })
    const dr = doc.getForm().acroForm.dict.lookup(PDFName.of("DR"), PDFDict)
    expect(dr.lookup(PDFName.of("Font"), PDFDict).has(PDFName.of("Helv"))).toBe(true)
  })
}

test("the blanks folder holds the customer's two PDF forms", () => {
  expect(readdirSync(DIR)).toEqual(expect.arrayContaining(["pl-d.pdf", "bg.pdf"]))
})
