import { DATE_KEYS, visible, type EmploymentCode, type SchengenCode, type TextKey, type Values } from "./anketa"
import { CITIES } from "./cities"
import { PRINT_KEYS, type PrintKey, type Template } from "./template"

export type Address = Record<"country" | "city" | "street" | "house" | "flat" | "postcode", string>

// Item 19 has two lines: "street house-flat" and "postcode city, country". A missing part leaves no stray space, comma or dash.
export function addressLines(a: Address): [string, string] {
  const join = (sep: string, ...parts: string[]) => parts.map((s) => s.trim()).filter(Boolean).join(sep)
  return [join(" ", a.street, join("-", a.house, a.flat)), join(", ", join(" ", a.postcode, a.city), a.country)]
}

// A field the form hides reads as empty, whatever it still holds.
const shown = (v: Values, k: TextKey) => (visible(k, v) ? v[k] : "")

// The text of one cell, "" for none. List choices are printed as the template names them; a code it has no name for prints nothing.
function cellText(key: PrintKey, v: Values, t: Template): string {
  if (key === "firstEntry") return t.schengen[v.firstEntry as SchengenCode] ?? ""
  if (key === "place") return CITIES[t.country].find((c) => c.id === v.submissionCity)?.print ?? ""
  if (key === "address1" || key === "address2") {
    const p = v.actualDiffers === "yes" ? "actual" : "reg"
    const lines = addressLines({
      country: shown(v, `${p}Country`), city: shown(v, `${p}City`), street: shown(v, `${p}Street`),
      house: shown(v, `${p}House`), flat: shown(v, `${p}Flat`), postcode: shown(v, `${p}Postcode`),
    })
    return lines[key === "address1" ? 0 : 1].toUpperCase()
  }
  // The position if there is one, else the status.
  if (key === "profession") return shown(v, "position").trim().toUpperCase() || (t.employment[v.employment as EmploymentCode] ?? "")
  // The employer's e-mail is typed in but the blank has no place for it.
  if (key === "employer")
    return [shown(v, "employerName"), shown(v, "employerAddress"), shown(v, "employerPhone")]
      .map((s) => s.trim()).filter(Boolean).join(", ").toUpperCase()
  const field = key === "date" ? "submissionDate" : key
  const text = shown(v, field).trim()
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
