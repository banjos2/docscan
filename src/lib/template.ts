import type { ChoiceKey, EmploymentCode, MEANS, OPTIONS, SchengenCode } from "./anketa"
import type { CountryCode } from "./cities"
import { ES } from "./templates/es"

export type Pos = { page: number; x: number; y: number }
export type TextPos = Pos & { size: number; maxWidth: number }

// The blank's text cells. Its own list, not TEXT_KEYS: a cell isn't always one typed field
// (firstEntry and place come from lists, "date" is the submission date, address1/2, profession
// and employer are put together from several fields).
export const PRINT_KEYS = [
  "surname", "surnameAtBirth", "firstName", "birthDate", "placeOfBirth", "countryOfBirth",
  "nationality", "nationalityAtBirth", "nationalId", "docNumber", "issueDate", "expiryDate", "issuedBy",
  "address1", "address2", "email", "phone", "profession", "employer", "destination", "firstEntry",
  "arrivalDate", "departureDate", "host", "hostAddress1", "hostAddress2", "hostPhone",
  "sponsorWho", "place", "date",
] as const

export type PrintKey = (typeof PRINT_KEYS)[number]

// One blank form: which PDF, where each value goes on it, how it writes dates.
export type Template = {
  country: CountryCode
  label: string
  pdf: string
  formatDate: (iso: string) => string
  // The Schengen states as the blank writes them.
  schengen: Record<SchengenCode, string>
  // The employment statuses as item 21 writes them.
  employment: Record<EmploymentCode, string>
  text: Record<PrintKey, TextPos>
  boxes: { [K in ChoiceKey]: Record<keyof (typeof OPTIONS)[K], Pos> }
  sponsorOther: Pos
  meansBoxes: { [K in keyof typeof MEANS]: Record<keyof (typeof MEANS)[K], Pos> }
}

export const TEMPLATES: Template[] = [ES]
