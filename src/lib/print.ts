import { DATE_KEYS, type SchengenCode, type Values } from "./anketa"
import { CITIES } from "./cities"
import { PRINT_KEYS, type PrintKey, type Template } from "./template"

// The text of one cell, "" for none. List choices are printed as the template names them; a code it has no name for prints nothing.
function cellText(key: PrintKey, v: Values, t: Template): string {
  if (key === "firstEntry") return t.schengen[v.firstEntry as SchengenCode] ?? ""
  if (key === "place") return CITIES[t.country].find((c) => c.id === v.submissionCity)?.print ?? ""
  const field = key === "date" ? "submissionDate" : key
  if (field === "sponsorWho" && v.payer !== "sponsor") return ""
  const text = v[field].trim()
  if (!text) return ""
  if (DATE_KEYS.includes(field)) return t.formatDate(text)
  return key === "email" ? text : text.toUpperCase()
}

// What goes into each cell of the blank: capitals except e-mail, dates as the template writes them, nothing for empty.
export function printedText(v: Values, t: Template): Partial<Record<PrintKey, string>> {
  const out: Partial<Record<PrintKey, string>> = {}
  for (const key of PRINT_KEYS) {
    const text = cellText(key, v, t)
    if (text) out[key] = text
  }
  return out
}
