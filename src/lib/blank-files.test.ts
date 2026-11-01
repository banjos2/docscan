import { readdirSync, readFileSync } from "node:fs"
import { PDFCheckBox, PDFDocument, PDFName, PDFRadioGroup, PDFTextField } from "pdf-lib"
import { expect, test } from "vitest"

const DIR = new URL("../../public/blanks/", import.meta.url)

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
}

test("the blanks folder holds the customer's two PDF forms", () => {
  expect(readdirSync(DIR)).toEqual(expect.arrayContaining(["pl-d.pdf", "bg.pdf"]))
})
