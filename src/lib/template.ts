import type { ChoiceKey, MEANS, OPTIONS } from "./anketa"
import { ES } from "./templates/es"

export type Pos = { page: number; x: number; y: number }
export type TextPos = Pos & { size: number; maxWidth: number }

// The blank's text cells. Its own list, not TEXT_KEYS: a cell isn't always one form field ("date" is the signing date).
export const PRINT_KEYS = [
  "surname", "surnameAtBirth", "firstName", "birthDate", "placeOfBirth", "countryOfBirth",
  "nationality", "nationalityAtBirth", "nationalId", "docNumber", "issueDate", "expiryDate", "issuedBy",
  "address1", "address2", "email", "phone", "profession", "destination", "firstEntry",
  "arrivalDate", "departureDate", "host", "hostAddress1", "hostAddress2", "hostPhone",
  "sponsorWho", "place", "date",
] as const

export type PrintKey = (typeof PRINT_KEYS)[number]

// One blank form: which PDF, where each value goes on it, how it writes dates.
export type Template = {
  country: "ES"
  label: string
  pdf: string
  formatDate: (iso: string) => string
  text: Record<PrintKey, TextPos>
  boxes: { [K in ChoiceKey]: Record<keyof (typeof OPTIONS)[K], Pos> }
  sponsorOther: Pos
  meansBoxes: { [K in keyof typeof MEANS]: Record<keyof (typeof MEANS)[K], Pos> }
}

export const TEMPLATES: Template[] = [ES]
