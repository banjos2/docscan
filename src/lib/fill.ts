import { PDFDocument, PDFName, StandardFonts, type PDFAcroRadioButton, type PDFFont, type PDFForm, type PDFWidgetAnnotation } from "pdf-lib"
import { OPTIONS, visible, type ChoiceKey, type Values } from "./anketa"
import { cellText, printedText } from "./print"
import type { Questionnaire, Tick } from "./questionnaire"

// The form's own size while the text fits, else what fits the width (4 pt at least) and never taller than the field.
// 0 in the form means automatic: 10 pt then.
export const fitFontSize = (widthAt1pt: number, box: { width: number; height: number }, formSize: number) =>
  // A value too long even at 4 pt runs past the box: the field stays editable and the specialist shortens it.
  Math.max(4, Math.min(formSize > 0 ? formSize : 10, (box.width - 4) / widthAt1pt, box.height * 0.75))

// The width a text is drawn with: pdf-lib's widthOfTextAtSize subtracts the AFM's kerning pairs, but an appearance
// stream's Tj advances by the plain glyph widths, and PDFKit lays text out with lighter kerning than the AFM's.
export const unkernedWidth = (text: string, size: number, font: PDFFont) =>
  [...text].reduce((sum, c) => sum + font.widthOfTextAtSize(c, size), 0)

// The lines Preview (PDFKit) wraps a multiline field's text into, at most: it breaks after spaces, after a "-" or "/"
// that no digit or space follows, and through a word wider than the line, but never before / , ; . : ! ? ) ] }, even
// after a space (Unicode line breaking, UAX #14 rule LB13), 3 pt in from each side, measuring with macOS
// Helvetica, whose kerning is lighter than the AFM's: pdf-lib's kerned widths fell up to 6.5 pt short of it on a
// 50-character line at 10 pt. Unkerned AFM widths fell short by 0.08 pt at most, so ½ pt more inset per side covers it.
// ponytail: measured in scripts/render-pdf-page.js renders and AppKit widths of 3000 made-up strings at 4–14 pt;
// re-measure if a viewer cuts lines off.
export function previewLines(text: string, boxWidth: number, size: number, font: PDFFont): number {
  const width = boxWidth - 7
  const w = (s: string) => unkernedWidth(s.trimEnd(), size, font)
  let n = 0
  for (const para of text.split("\n")) {
    n++
    let line = ""
    // Pieces that end where a break is allowed; spaces before a closing mark stay inside the piece.
    for (const piece of para.match(/(?:\S|\s+(?=[/,;.:!?)\]}]))*?(?:\s+(?![\s/,;.:!?)\]}])|[-/](?=[^\s\d/,;.:!?)\]}])|$)/g) ?? []) {
      if (w(line + piece) <= width) {
        line += piece
        continue
      }
      if (line) n++
      line = ""
      for (const c of w(piece) <= width ? [piece] : [...piece]) {
        if (line && w(line + c) > width) {
          n++
          line = ""
        }
        line += c
      }
    }
  }
  return n
}

// The largest whole size from `base` down at which Preview shows every wrapped line of the text: it sets them
// round(1.2 × size) apart (5 pt at 4, 10 at 8, 12 at 10, 14 at 12), 3 pt in from the top and bottom (a 1 pt border takes
// ½ pt less, not more), and leaves out a line that doesn't fit whole. Whole sizes, the ones measured.
function multilineSize(text: string, widget: PDFWidgetAnnotation, base: number, font: PDFFont): number {
  const { width, height } = widget.getRectangle()
  let size = Math.floor(base)
  // A text too long even at 4 pt loses its last lines: the field stays editable and the specialist shortens it.
  while (size > 4 && previewLines(text, width, size, font) * Math.round(1.2 * size) > height - 6) size--
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
    // Every widget gets it too: Preview takes the size from the widget's own DA only (a widget without one, as in the
    // forms make-form builds, is drawn at 12 pt), and pdf-lib reads a widget's DA before the field's.
    const size = field.isMultiline()
      ? multilineSize(text, widgets[0], formSize > 0 ? formSize : 10, helvetica)
      : fitFontSize(unkernedWidth(text, 1, helvetica), box, formSize)
    const setDa = () => {
      const da = `/Helv ${size} Tf 0 g`
      field.acroField.setDefaultAppearance(da)
      for (const w of widgets) w.setDefaultAppearance(da)
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
