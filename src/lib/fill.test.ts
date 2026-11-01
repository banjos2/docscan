import { readFileSync, writeFileSync } from "node:fs"
import { basename } from "node:path"
import { layoutMultilineText, PDFAcroRadioButton, PDFDocument, PDFName, StandardFonts, TextAlignment, type PDFForm } from "pdf-lib"
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

// Preview lays a multiline field out itself, from /V and /DA (measured on the Polish form): in the box inset 3 pt on
// each side, a line pitch of up to 1.25 × size, and a line that doesn't fit whole is left out.
test("a long value in a multiline box shrinks until Preview shows all its lines", async () => {
  const v = {
    ...SPECIMEN, regStreet: "Grosse Friedrichsburger Strasse", regHouse: "117", regFlat: "45", email: "erika.mustermann.1964@example.com",
    orgName: "Przedsiebiorstwo Produkcyjno-Uslugowe Budmex Sp. z o.o.", orgAddress: "ul. Przemyslowa 12, 62-800 Kalisz, Poland",
  }
  const out = await PDFDocument.load(await fillForm(PL_D_BYTES, v, Q("pl-work")))
  const font = await out.embedFont(StandardFonts.Helvetica)
  // Item 17's address and e-mail, 250.7 × 36.6 pt, and item 32's organization, 241.5 × 30.5 pt: three lines each at 10 pt.
  for (const name of ["Text16", "Text37"]) {
    const field = out.getForm().getTextField(name)
    const { width, height } = field.acroField.getWidgets()[0].getRectangle()
    const size = Number(/(\d*\.?\d+) Tf/.exec(field.acroField.getDefaultAppearance() ?? "")?.[1])
    const bounds = { x: 3, y: 3, width: width - 6, height: height - 6 }
    const { lines } = layoutMultilineText(field.getText() ?? "", { alignment: TextAlignment.Left, fontSize: size, font, bounds })
    expect(size, name).toBeLessThan(10)
    expect(lines.length * 1.25 * size, name).toBeLessThanOrEqual(bounds.height)
  }
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
