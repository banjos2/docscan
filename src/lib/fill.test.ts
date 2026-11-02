import { readFileSync, writeFileSync } from "node:fs"
import { basename } from "node:path"
import { PDFAcroRadioButton, PDFDocument, PDFName, StandardFonts, type PDFFont, type PDFForm } from "pdf-lib"
import { expect, test } from "vitest"
import { fillForm, fitFontSize, previewLines, unkernedWidth } from "./fill"
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
      // A size of its own, never the form's automatic 0, in the font the form's resources name; on every widget too,
      // since Preview reads only the widget's own DA.
      if (field.getText()) {
        expect(field.acroField.getDefaultAppearance(), name).toMatch(/^\/Helv (?!0 )\d*\.?\d+ Tf 0 g$/)
        for (const w of field.acroField.getWidgets()) expect(w.getDefaultAppearance(), name).toBe(field.acroField.getDefaultAppearance())
      }
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

// Preview (PDFKit) lays a multiline field out itself, from /V and the widget's own /DA (without one it draws 12 pt):
// lines round(1.2 × size) apart, 3 pt in from the top and bottom, and a line that doesn't fit whole is left out.
// Measured in scripts/render-pdf-page.js renders at 4–14 pt.
const previewFits = (text: string, box: { width: number; height: number }, size: number, font: PDFFont) =>
  previewLines(text, box.width, size, font) * Math.round(1.2 * size) <= box.height - 6

test("lines are counted as Preview wraps them: after hyphens, through a word wider than the line, not before a comma or after a bracket", async () => {
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
  // Line counts PDFKit drew at 10 pt in boxes 92 and 143 pt wide; pdf-lib's own layout makes each one line.
  expect(previewLines("PRZEDSIEBIORSTWOPRODUKCYJNOHANDLOWEBUDMEX SP. Z O.O.", 92, 10, font)).toBe(5)
  expect(previewLines("KOWALSKA-NOWAKOWSKA-WISNIEWSKA DOROTA, UL. FABRYCZNA/POLNA 7-9", 143, 10, font)).toBe(4)
  // A stray " , " or " ; " stays with the word before it, spaces and all: PDFKit drew 6 lines in 93.2 pt.
  expect(previewLines("Sp. z o.o. , ul. Polna 5 , Warszawa ; Poland . Lorem ipsum dolor sit amet", 93.2, 10, font)).toBe(6)
  // A "( " never ends a line: PDFKit drew 3 lines in 149 pt, "( WARSZAWSKA )" together at the start of the second.
  expect(previewLines("SP. Z O.O. BUDMEX ( WARSZAWSKA ) UL. POLNA 7", 149, 10, font)).toBe(3)
})

test("item 31's contact with a hyphenated e-mail goes down to the size at which Preview shows all its lines", async () => {
  const q = Q("pl-guest-s")
  const v = { ...SPECIMEN, orgContactSurname: "Wisniewska-Kowalczyk", orgContactFirstName: "Aleksandra", orgEmail: "aleksandra.wisniewska-kowalczyk@budmex-kalisz.example" }
  const out = await PDFDocument.load(await fillForm(read(q.blank.file), v, q))
  const field = out.getForm().getTextField("orgContact+orgEmail")
  const [widget] = field.acroField.getWidgets()
  expect(field.getText()).toBe("WISNIEWSKA-KOWALCZYK ALEKSANDRA\naleksandra.wisniewska-kowalczyk@budmex-kalisz.example")
  // Preview breaks the e-mail after its hyphen: three lines, 3 × 8 + 6 = 30 pt at 7 pt; at 8, 3 × 10 + 6 = 36.
  expect(widget.getDefaultAppearance()).toBe("/Helv 7 Tf 0 g")
})

test("item 31's two-line contact on the Polish Word form shows both lines in Preview", async () => {
  const q = Q("pl-guest-s")
  const out = await PDFDocument.load(await fillForm(read(q.blank.file), SPECIMEN, q))
  const field = out.getForm().getTextField("orgContact+orgEmail")
  const [widget] = field.acroField.getWidgets()
  expect(field.getText()).toBe("PEREZ JUAN\nJuan.Perez@acme.example")
  expect(widget.getRectangle()).toMatchObject({ width: 189, height: 33 })
  // 2 × 12 + 6 = 30 pt at 10 pt; at the 12 pt Preview takes for a widget without a DA, 2 × 14 + 6 = 34.
  expect(widget.getDefaultAppearance()).toBe("/Helv 10 Tf 0 g")
  expect(previewFits(field.getText() ?? "", widget.getRectangle(), 10, await out.embedFont(StandardFonts.Helvetica))).toBe(true)
})

test("a line Preview would wrap goes a size down", async () => {
  const q = Q("pl-s")
  // In item 19's 373 × 26 box PDFKit wraps it at 10 pt and leaves the second line out (pdf-lib's kerned widths make it
  // 366.5 pt, one line); at 9 pt it shows whole.
  const v = { ...SPECIMEN, employerName: "Poltrans Sp. z o.o.", employerAddress: "ul. Fabryczna 123, 62-800 Kalisz", employerPhone: "+48 62 555 01 123" }
  const out = await PDFDocument.load(await fillForm(read(q.blank.file), v, q))
  const field = out.getForm().getTextField("employer")
  const [widget] = field.acroField.getWidgets()
  expect(field.getText()).toBe("POLTRANS SP. Z O.O., UL. FABRYCZNA 123, 62-800 KALISZ, +48 62 555 01 123")
  expect(widget.getDefaultAppearance()).toBe("/Helv 9 Tf 0 g")
  expect(previewFits(field.getText() ?? "", widget.getRectangle(), 9, await out.embedFont(StandardFonts.Helvetica))).toBe(true)
})

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
    const [widget] = field.acroField.getWidgets()
    const size = Number(/(\d*\.?\d+) Tf/.exec(widget.getDefaultAppearance() ?? "")?.[1])
    expect(size, name).toBeLessThan(10)
    expect(previewFits(field.getText() ?? "", widget.getRectangle(), size, font), name).toBe(true)
    // and one size up it would not: the size is the largest that fits
    expect(previewFits(field.getText() ?? "", widget.getRectangle(), size + 1, font), name).toBe(false)
  }
})

test("a long one-line value fits its box as drawn, without the AFM's kerning", async () => {
  const q = Q("pl-s")
  // Made up, full of the pairs the AFM kerns: AV, WA, TA, Y.
  const v = { ...SPECIMEN, hostAddress: "AVATAR WAY 7, TAVAWAY. VAT AVENUE 9, WAWAYA TOWN", hostEmail: "" }
  const out = await PDFDocument.load(await fillForm(read(q.blank.file), v, q))
  const field = out.getForm().getTextField("hostAddress+hostEmail")
  const [widget] = field.acroField.getWidgets()
  const size = Number(/(\d*\.?\d+) Tf/.exec(widget.getDefaultAppearance() ?? "")?.[1])
  expect(field.isMultiline()).toBe(false)
  expect(field.getText()).toBe(v.hostAddress)
  // pdf-lib draws it with Tj inside a clip 1 pt in from each side.
  expect(unkernedWidth(v.hostAddress, size, await out.embedFont(StandardFonts.Helvetica))).toBeLessThanOrEqual(widget.getRectangle().width - 2)
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
