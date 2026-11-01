import { layoutMultilineText, PDFDocument, PDFName, StandardFonts, TextAlignment, type PDFAcroRadioButton, type PDFFont, type PDFForm, type PDFWidgetAnnotation } from "pdf-lib"
import { OPTIONS, visible, type ChoiceKey, type Values } from "./anketa"
import { cellText, printedText } from "./print"
import type { Questionnaire, Tick } from "./questionnaire"

// The form's own size while the text fits, else what fits the width (4 pt at least) and never taller than the field.
// 0 in the form means automatic: 10 pt then.
export const fitFontSize = (widthAt1pt: number, box: { width: number; height: number }, formSize: number) =>
  // A value too long even at 4 pt runs past the box: the field stays editable and the specialist shortens it.
  Math.max(4, Math.min(formSize > 0 ? formSize : 10, (box.width - 4) / widthAt1pt, box.height * 0.75))

// The largest whole size from `base` down at which Preview shows every wrapped line of the text. Preview lays a multiline
// field out itself from /V and /DA, tighter than pdf-lib's appearance: in the box inset 3 pt on each side (and inside
// any border), at a line pitch of up to 1.25 × size (5 pt at 4, 10 at 8, 12 at 10, 14 at 12), leaving out a line that
// doesn't fit whole. Whole sizes, because Preview rounds the size before it lays the lines out.
// ponytail: measured in Preview on the Polish form's boxes; re-measure if another viewer cuts lines off.
function multilineSize(text: string, widget: PDFWidgetAnnotation, base: number, font: PDFFont): number {
  const { width, height } = widget.getRectangle()
  const inset = (widget.getBorderStyle()?.getWidth() ?? 0) + 3
  const bounds = { x: inset, y: inset, width: width - 2 * inset, height: height - 2 * inset }
  const lines = (size: number) => layoutMultilineText(text, { alignment: TextAlignment.Left, fontSize: size, font, bounds }).lines.length
  let size = Math.floor(base)
  // A text too long even at 4 pt loses its last lines: the field stays editable and the specialist shortens it.
  while (size > 4 && lines(size) * 1.25 * size > bounds.height) size--
  return size
}

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
    const widgets = field.acroField.getWidgets()
    const box = widgets[0].getRectangle()
    const formSize = daSize(widgets[0].getDefaultAppearance() ?? field.acroField.getDefaultAppearance())
    // The Polish form marks its one-row boxes multiline too. Preview sets a multiline field's first line low and cuts it
    // off in such a box (any size over ~5 pt in an 11 pt row); as a single line it is centred and fitted like the others.
    // ponytail: 2.6 × size is two lines at 1.2 leading plus a descender, as Preview lays them out; retune if a new form's
    // two-line boxes come out single.
    if (field.isMultiline() && box.height < 2.6 * (formSize > 0 ? formSize : 10)) field.disableMultiline()
    const text = cellText(spec, printed, field.isMultiline())
    field.setText(text)
    if (!text) continue
    // A size of our own in the DA: the forms' automatic size grows the text with the box (36–49 pt in the Polish ones),
    // so a multiline field keeps the form's size (or 10 pt) and goes smaller only when its lines would not all show.
    // pdf-lib reads a widget's DA before the field's, so a widget that has one gets it too.
    const size = field.isMultiline()
      ? multilineSize(text, widgets[0], formSize > 0 ? formSize : 10, helvetica)
      : fitFontSize(helvetica.widthOfTextAtSize(text, 1), box, formSize)
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
