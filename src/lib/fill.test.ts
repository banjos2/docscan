import { readFileSync, writeFileSync } from "node:fs"
import { basename } from "node:path"
import { PDFAcroRadioButton, PDFDocument, PDFName, type PDFForm } from "pdf-lib"
import { expect, test } from "vitest"
import { fillForm, fitFontSize } from "./fill"
import { cellText, printedText } from "./print"
import { QUESTIONNAIRES, type Tick } from "./questionnaire"
import { SPECIMEN } from "./specimen"

const Q = (id: string) => QUESTIONNAIRES.find((q) => q.id === id)!
const read = (file: string) => readFileSync(new URL(`../../public/${file}`, import.meta.url))
const PL_D_BYTES = read(Q("pl-guest-d").blank.file)

// SPECIMEN's choices, defaults included.
const SPECIMEN_TICKS = ["sex.F", "maritalStatus.married", "docType.ordinary", "residesElsewhere.no", "purpose.tourism",
  "entries.multiple", "fingerprints.no", "payer.sponsor", "means.sponsor.cash", "sponsorOther"]

const tick = (form: PDFForm, t: Tick) =>
  typeof t === "string" ? form.getCheckBox(t).check() : (form.getRadioGroup(t.radio).acroField as PDFAcroRadioButton).setValue(PDFName.of(t.on))

// A checkbox holding its on-value, or the radio widget with that on-name showing it.
const isOn = (form: PDFForm, t: Tick) => {
  if (typeof t === "string") return form.getCheckBox(t).isChecked()
  const widget = form.getRadioGroup(t.radio).acroField.getWidgets().find((w) => w.getOnValue() === PDFName.of(t.on))
  return widget?.getAppearanceState() === PDFName.of(t.on)
}

// The first questionnaire of each blank.
for (const q of QUESTIONNAIRES.filter((q, i) => QUESTIONNAIRES.findIndex((p) => p.blank === q.blank) === i)) {
  const { blank } = q
  test(`${blank.file}: SPECIMEN fills every mapped field and ticks exactly its choices, whatever was ticked before`, async () => {
    const before = await PDFDocument.load(read(blank.file))
    // Radios end up on their last option.
    for (const t of Object.values(blank.ticks)) tick(before.getForm(), t)
    const bytes = await fillForm(await before.save({ updateFieldAppearances: false }), SPECIMEN, q)
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${basename(blank.file)}`, bytes)
    const form = (await PDFDocument.load(bytes)).getForm()

    const expected = [...SPECIMEN_TICKS, ...("prevVisas.no" in blank.ticks ? ["prevVisas.no"] : [])]
    expect(Object.keys(blank.ticks)).toEqual(expect.arrayContaining(expected))
    expect(Object.keys(blank.ticks).filter((k) => isOn(form, blank.ticks[k])).sort()).toEqual(expected.sort())

    const printed = printedText(SPECIMEN, q)
    for (const [name, spec] of Object.entries(blank.text)) {
      const field = form.getTextField(name)
      expect(field.getText() ?? "", name).toBe(cellText(spec, printed, field.isMultiline()))
      // A size of its own, never the form's automatic 0, in the font the form's resources name.
      if (field.getText()) expect(field.acroField.getDefaultAppearance(), name).toMatch(/^\/Helv (?!0 )\d*\.?\d+ Tf 0 g$/)
    }
    expect(form.getFields().length).toBe(before.getForm().getFields().length)
  })
}

test("a Polish radio group with repeated export values gets exactly the chosen widget", async () => {
  const bytes = await fillForm(PL_D_BYTES, { ...SPECIMEN, maritalStatus: "divorced" }, Q("pl-guest-d"))
  const widgets = (await PDFDocument.load(bytes)).getForm().getRadioGroup("Group50").acroField.getWidgets()
  expect(widgets.map((w) => `${w.getOnValue()?.decodeText()}:${w.getAppearanceState()?.decodeText()}`)).toEqual(["0:Off", "1:Off", "2:Off", "3:3", "4:Off", "5:Off"])
})

test("a one-row box the form marks multiline is filled as one line, a taller one keeps its lines", async () => {
  const form = (await PDFDocument.load(await fillForm(PL_D_BYTES, SPECIMEN, Q("pl-guest-d")))).getForm()
  // Item 31's address box, 22.5 pt high: room for one line.
  expect(form.getTextField("Text36").getText()).toBe("CALLE MAYOR 1, 28013 MADRID, SPAIN, Reservas@Ejemplo.example")
  expect(form.getTextField("Text7").isMultiline()).toBe(false)
  // Item 32's contact box, 33 pt high.
  expect(form.getTextField("Text39").getText()).toBe("PEREZ JUAN\nJuan.Perez@acme.example")
})

test("fillForm rejects text that Helvetica cannot encode", async () => {
  await expect(fillForm(PL_D_BYTES, { ...SPECIMEN, placeOfBirth: "Минск" }, Q("pl-guest-d"))).rejects.toThrow()
})

test("a long value keeps the form's font size when it fits and shrinks to the field's width when not", () => {
  expect(fitFontSize(20, { width: 200, height: 14 }, 9)).toBe(9)
  expect(fitFontSize(40, { width: 200, height: 14 }, 9)).toBeCloseTo(4.9)
  expect(fitFontSize(10, { width: 200, height: 14 }, 0)).toBe(10)
  expect(fitFontSize(100, { width: 200, height: 14 }, 9)).toBe(4)
})
