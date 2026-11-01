import { DATE_KEYS, realIso, toDmy, visible, type EmploymentCode, type SchengenCode, type TextKey, type Values } from "./anketa"
import { CITIES } from "./cities"
import type { Questionnaire } from "./questionnaire"

// What a blank can print. Its own list, not TEXT_KEYS: a cell isn't always one typed field (firstEntry and place come
// from lists, "date" is the submission date, duration is counted, address, profession, employer, host, org and
// orgContact are put together from several fields).
export const PRINT_KEYS = [
  "surname", "surnameAtBirth", "firstName", "birthDate", "placeOfBirth", "countryOfBirth",
  "nationality", "nationalityAtBirth", "nationalId", "docNumber", "issueDate", "expiryDate", "issuedBy",
  "address", "email", "phone", "profession", "employer", "purposeOther", "basis", "destination", "firstEntry", "duration",
  "prevVisa1From", "prevVisa1To", "prevVisa2From", "prevVisa2To", "prevVisa3From", "prevVisa3To",
  "prevVisa4From", "prevVisa4To", "prevVisa5From", "prevVisa5To",
  "arrivalDate", "departureDate", "host", "hostAddress", "hostPhone", "hostEmail",
  "org", "orgContact", "orgPhone", "orgEmail", "sponsorWho", "workPermit", "place", "date",
] as const

export type PrintKey = (typeof PRINT_KEYS)[number]
// What one PDF field gets: a print key, or two of them in one cell ("address+email").
export type CellSpec = PrintKey | `${PrintKey}+${PrintKey}`

// List choices print in English on every blank.
export const COUNTRY_EN: Record<SchengenCode, string> = {
  AT: "AUSTRIA", BE: "BELGIUM", BG: "BULGARIA", HU: "HUNGARY", DE: "GERMANY", GR: "GREECE", DK: "DENMARK",
  IS: "ICELAND", ES: "SPAIN", IT: "ITALY", LV: "LATVIA", LT: "LITHUANIA", LI: "LIECHTENSTEIN", LU: "LUXEMBOURG",
  MT: "MALTA", NL: "NETHERLANDS", NO: "NORWAY", PL: "POLAND", PT: "PORTUGAL", RO: "ROMANIA", SK: "SLOVAKIA",
  SI: "SLOVENIA", FI: "FINLAND", FR: "FRANCE", HR: "CROATIA", CZ: "CZECH REPUBLIC", CH: "SWITZERLAND", SE: "SWEDEN",
  EE: "ESTONIA",
}

export const STATUS_EN: Record<EmploymentCode, string> = {
  employed: "EMPLOYEE",
  unemployed: "NO OCCUPATION",
  pupil: "PUPIL",
  student: "STUDENT",
  pensioner: "PENSIONER",
  entrepreneur: "INDIVIDUAL ENTREPRENEUR",
  selfEmployed: "SELF-EMPLOYED",
}

export type Address = Record<"country" | "city" | "street" | "house" | "flat" | "postcode", string>

// The non-empty parts, trimmed, with sep between them: a missing part leaves no stray space, comma or dash.
const join = (sep: string, ...parts: string[]) => parts.map((s) => s.trim()).filter(Boolean).join(sep)

// One line, in the order of the customer's samples: "country, postcode, city, street house-flat".
export const addressLine = (a: Address) => join(", ", a.country, a.postcode, a.city, join(" ", a.street, join("-", a.house, a.flat)))

// Days of the stay, arrival and departure included; "" unless both are real dates in that order.
export function stayDays(arrivalIso: string, departureIso: string): string {
  const [from, to] = [realIso(arrivalIso), realIso(departureIso)]
  return from && to && from <= to ? String((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1) : ""
}

// The text of one print key, "" for none. A field the questionnaire hides reads as empty, whatever it still holds.
function keyText(key: PrintKey, v: Values, q: Questionnaire): string {
  const shown = (k: keyof Values) => (visible(k, v, q.items) ? (v[k] as string) : "")
  if (key === "firstEntry") return COUNTRY_EN[shown("firstEntry") as SchengenCode] ?? ""
  if (key === "place") return CITIES[q.country].find((c) => c.id === shown("submissionCity"))?.print ?? ""
  if (key === "duration") return stayDays(shown("arrivalDate"), shown("departureDate"))
  if (key === "address") {
    const p = v.actualDiffers === "yes" ? "actual" : "reg"
    return addressLine({
      country: shown(`${p}Country`), city: shown(`${p}City`), street: shown(`${p}Street`),
      house: shown(`${p}House`), flat: shown(`${p}Flat`), postcode: shown(`${p}Postcode`),
    }).toUpperCase()
  }
  // The position if there is one, else the status.
  if (key === "profession") return shown("position").trim().toUpperCase() || (STATUS_EN[shown("employment") as EmploymentCode] ?? "")
  // The employer's e-mail is typed in but the blank has no place for it.
  if (key === "employer") return join(", ", shown("employerName"), shown("employerAddress"), shown("employerPhone")).toUpperCase()
  // The "other (specify)" line of the purpose holds the Karta Polaka number.
  if (key === "purposeOther") {
    const kp = shown("kpNumber").trim().toUpperCase()
    return kp && `KARTA POLAKA ${kp}`
  }
  // One line for the name: the hotel, or the person as "surname first name" (only one of the kinds is visible).
  if (key === "host") return join(" ", shown("hotelName"), shown("hostSurname"), shown("hostFirstName")).toUpperCase()
  if (key === "org") return join(", ", shown("orgName"), shown("orgAddress")).toUpperCase()
  if (key === "orgContact") return join(" ", shown("orgContactSurname"), shown("orgContactFirstName")).toUpperCase()
  const field: TextKey = key === "date" ? "submissionDate" : key
  const text = shown(field).trim()
  if (!text) return ""
  if (DATE_KEYS.includes(field)) return toDmy(text)
  return field === "email" || field === "hostEmail" || field === "orgEmail" ? text : text.toUpperCase()
}

// What the blank prints for each key: capitals except e-mail, dates as dd-mm-yyyy, nothing for empty.
export function printedText(v: Values, q: Questionnaire): Partial<Record<PrintKey, string>> {
  const out: Partial<Record<PrintKey, string>> = {}
  for (const key of PRINT_KEYS) {
    const text = keyText(key, v, q)
    if (text) out[key] = text
  }
  return out
}

// The text of one PDF field: its parts that have text, one per line in a multiline field.
export const cellText = (spec: CellSpec, printed: Partial<Record<PrintKey, string>>, multiline: boolean) =>
  spec.split("+").map((k) => printed[k as PrintKey] ?? "").filter(Boolean).join(multiline ? "\n" : ", ")
