import { readdirSync, readFileSync } from "node:fs"
import { PDFCheckBox, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRadioGroup, PDFString, PDFTextField } from "pdf-lib"
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
    expect([doc.getAuthor(), doc.getCreator(), doc.getProducer(), doc.getTitle(), doc.getSubject(), doc.getKeywords()]).toEqual(Array(6).fill(undefined))
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
