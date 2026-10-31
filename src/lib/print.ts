import { DATE_KEYS, type TextKey, type Values } from "./anketa"
import { PRINT_KEYS, type PrintKey, type Template } from "./template"

// What goes into each cell of the blank: capitals except e-mail, dates as the template writes them, nothing for empty.
export function printedText(v: Values, t: Template): Partial<Record<PrintKey, string>> {
  const out: Partial<Record<PrintKey, string>> = {}
  for (const key of PRINT_KEYS) {
    const field: TextKey = key === "date" ? "signDate" : key
    if (field === "sponsorWho" && v.payer !== "sponsor") continue
    let text = v[field].trim()
    if (!text) continue
    if (DATE_KEYS.includes(field)) text = t.formatDate(text)
    else if (key !== "email") text = text.toUpperCase()
    out[key] = text
  }
  return out
}
