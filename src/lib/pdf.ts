import { PDFDocument, StandardFonts } from "pdf-lib"
import { OPTIONS, type ChoiceKey, type Values } from "./anketa"
import { printedText } from "./print"
import type { Pos, Template } from "./template"

export async function fillAnketa(pdfBytes: ArrayBuffer | Uint8Array, v: Values, t: Template): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const dingbats = await pdf.embedFont(StandardFonts.ZapfDingbats)
  const pages = pdf.getPages()
  const tick = ({ page, x, y }: Pos) => pages[page].drawText("✔", { x: x + 0.6, y: y + 0.6, size: 5, font: dingbats })

  for (const [key, text] of Object.entries(printedText(v, t))) {
    const { page, x, y, size, maxWidth } = t.text[key as keyof Template["text"]]
    // Shrink long values to fit the box instead of running into the next column.
    const fit = Math.max(5, Math.min(size, (size * maxWidth) / font.widthOfTextAtSize(text, size)))
    pages[page].drawText(text, { x, y, size: fit, font })
  }

  for (const key of Object.keys(OPTIONS) as ChoiceKey[]) {
    // v[key] is a plain string at runtime (user input / MRZ text), not the option's literal key
    // union, so it's looked up rather than indexed directly.
    const pos = (t.boxes[key] as Record<string, Pos>)[v[key]]
    if (pos) tick(pos)
  }
  if (v.payer === "sponsor" && v.sponsorWho.trim()) tick(t.sponsorOther)
  const means = (t.meansBoxes as Record<string, Record<string, Pos>>)[v.payer] ?? {}
  for (const m of v.means) if (means[m]) tick(means[m])

  return pdf.save()
}
