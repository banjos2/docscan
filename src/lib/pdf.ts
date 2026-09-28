import { PDFDocument, StandardFonts } from "pdf-lib"
import { DATE_KEYS, OPTIONS, TEXT_KEYS, toDmy, type ChoiceKey, type Values } from "./anketa"
import { BOXES, MEANS_BOXES, SPONSOR_OTHER, TEXT, type Pos } from "./layout"

export async function fillAnketa(template: ArrayBuffer | Uint8Array, v: Values): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const dingbats = await pdf.embedFont(StandardFonts.ZapfDingbats)
  const pages = pdf.getPages()
  const tick = ({ page, x, y }: Pos) => pages[page].drawText("✔", { x: x + 0.6, y: y + 0.6, size: 5, font: dingbats })

  for (const key of TEXT_KEYS) {
    if (key === "sponsorWho" && v.payer !== "sponsor") continue
    let text = v[key].trim()
    if (!text) continue
    if (DATE_KEYS.includes(key)) text = toDmy(text)
    else if (key !== "email") text = text.toUpperCase()
    const { page, x, y, size, maxWidth } = TEXT[key]
    // Shrink long values to fit the box instead of running into the next column.
    const fit = Math.max(5, Math.min(size, (size * maxWidth) / font.widthOfTextAtSize(text, size)))
    pages[page].drawText(text, { x, y, size: fit, font })
  }

  for (const key of Object.keys(OPTIONS) as ChoiceKey[]) {
    // v[key] is a plain string at runtime (user input / MRZ text), not the option's literal key
    // union, so it's looked up rather than indexed directly.
    const pos = (BOXES[key] as Record<string, Pos>)[v[key]]
    if (pos) tick(pos)
  }
  if (v.payer === "sponsor" && v.sponsorWho.trim()) tick(SPONSOR_OTHER)
  const means = (MEANS_BOXES as Record<string, Record<string, Pos>>)[v.payer] ?? {}
  for (const m of v.means) if (means[m]) tick(means[m])

  return pdf.save()
}
