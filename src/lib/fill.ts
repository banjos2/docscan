import { PDFDocument, PDFName, StandardFonts, type PDFAcroRadioButton, type PDFForm } from "pdf-lib"
import { OPTIONS, visible, type ChoiceKey, type Values } from "./anketa"
import { cellText, printedText } from "./print"
import type { Questionnaire, Tick } from "./questionnaire"

// The form's own size while the text fits, else what fits the width (4 pt at least) and never taller than the field.
// 0 in the form means automatic: 10 pt then.
export const fitFontSize = (widthAt1pt: number, box: { width: number; height: number }, formSize: number) =>
  Math.max(4, Math.min(formSize > 0 ? formSize : 10, (box.width - 4) / widthAt1pt, box.height * 0.75))

// The size in a DA such as "/Helv 8 Tf 0 g"; 0 for automatic or no DA.
const daSize = (da: string | undefined) => Number(/(\d*\.?\d+)\s+Tf/.exec(da ?? "")?.[1] ?? 0)

// Radios by their widget's on-name, not select(): the Polish form's groups repeat export values in /Opt.
function setTick(form: PDFForm, t: Tick, on: boolean) {
  if (typeof t === "string") {
    const box = form.getCheckBox(t)
    if (on) box.check()
    else box.uncheck()
  } else (form.getRadioGroup(t.radio).acroField as PDFAcroRadioButton).setValue(PDFName.of(on ? t.on : "Off"))
}

// Fills the questionnaire's blank by field name and leaves the form editable.
export async function fillForm(bytes: ArrayBuffer | Uint8Array, v: Values, q: Questionnaire): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
  const printed = printedText(v, q)

  for (const [name, spec] of Object.entries(q.blank.text)) {
    const field = form.getTextField(name)
    const text = cellText(spec, printed, field.isMultiline())
    field.setText(text)
    if (!text) continue
    // A size of our own in the DA: the forms' automatic size grows the text with the box (36–49 pt in the Polish ones).
    // pdf-lib reads a widget's DA before the field's, so a widget that has one gets it too.
    const widgets = field.acroField.getWidgets()
    const formSize = daSize(widgets[0].getDefaultAppearance() ?? field.acroField.getDefaultAppearance())
    const size = field.isMultiline()
      ? formSize > 0 ? formSize : 10
      : fitFontSize(helvetica.widthOfTextAtSize(text, 1), widgets[0].getRectangle(), formSize)
    const setDa = () => {
      const da = `/Helv ${size} Tf 0 g`
      field.acroField.setDefaultAppearance(da)
      for (const w of widgets) if (w.getDefaultAppearance()) w.setDefaultAppearance(da)
    }
    setDa()
    // Throws on text Helvetica cannot encode.
    field.updateAppearances(helvetica)
    // pdf-lib leaves "/Helvetica" in the DA, a font the form's /DR lacks: a viewer redrawing the field wants /Helv.
    setDa()
  }

  // Off first: a box the form came with ticked must not stay ticked.
  for (const t of Object.values(q.blank.ticks)) setTick(form, t, false)
  const keys = (Object.keys(OPTIONS) as ChoiceKey[]).filter((k) => v[k] && visible(k, v, q.items)).map((k) => `${k}.${v[k]}`)
  if (visible("means", v, q.items)) keys.push(...v.means.map((m) => `means.${v.payer}.${m}`))
  if (printed.sponsorWho) keys.push("sponsorOther")
  for (const key of keys) if (q.blank.ticks[key]) setTick(form, q.blank.ticks[key], true)

  // Redrawing every field would bake an automatic size into the empty ones; boxes keep the form's own appearances.
  return pdf.save({ updateFieldAppearances: false })
}
