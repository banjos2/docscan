import type { Item, Items, Values } from "./anketa"
import { BG } from "./blanks/bg"
import plC from "./blanks/pl-c.fields"
import { PL_D } from "./blanks/pl-d"
import { CITIES, type CountryCode } from "./cities"
import type { CellSpec } from "./print"

// A checkbox by its field name, or the widget of a radio group whose appearance on-name is `on`.
export type Tick = string | { radio: string; on: string }
// One PDF form in public/. text: PDF text field name → what it prints. ticks: tick key → the box that shows it.
// Tick keys: `${ChoiceKey}.${option}`, `means.${payer}.${option}`, and "sponsorOther" (ticked with a printed sponsorWho).
export type Blank = { file: string; text: Record<string, CellSpec>; ticks: Record<string, Tick> }
// One visa type: its blank, the country whose cities it lists, the items it has with their numbers, what choosing it presets.
export type Questionnaire = { id: string; label: string; country: CountryCode; blank: Blank; items: Items; presets: Partial<Values> }

// Schengen blanks "A": arrival and departure are item 28 of their own.
export const NUMBERING_A: Items = {
  address: 19, residence: 20, occupation: 21, employer: 22, purpose: 23, destination: 25, firstEntry: 26, entries: 27,
  arrival: 28, departure: 28, fingerprints: 29, host: 31, org: 32, costs: 33, submission: null,
}
// Schengen blanks "B": the dates sit unnumbered inside item 27, so the items after it are one lower.
export const NUMBERING_B: Items = { ...NUMBERING_A, arrival: null, departure: null, fingerprints: 28, host: 30, org: 31, costs: 32 }
// The Polish national form "D". It prints the destination itself, Poland.
export const NUMBERING_D: Items = {
  address: 17, residence: 18, occupation: 19, employer: 20, purpose: 21, firstEntry: 23, entries: 24, prevVisas: 26,
  fingerprints: 27, arrival: 29, departure: 30, host: 31, org: 32, costs: 33, submission: 37,
}

// A form made from Word names its fields after what they print: a text field by its CellSpec, a checkbox by its tick key.
export const fromFields = (file: string, fields: { text: readonly string[]; boxes: readonly string[] }): Blank => ({
  file,
  text: Object.fromEntries(fields.text.map((name) => [name, name as CellSpec])),
  ticks: Object.fromEntries(fields.boxes.map((name) => [name, name])),
})

const PL_C = fromFields("blanks/pl-c.pdf", plC)

export const QUESTIONNAIRES: Questionnaire[] = [
  { id: "pl-s", label: "Польша С", country: "PL", blank: PL_C, items: NUMBERING_B, presets: { purpose: "tourism", hostKind: "hotel" } },
  { id: "pl-guest-s", label: "Польша гости С", country: "PL", blank: PL_C, items: NUMBERING_B, presets: { purpose: "tourism", hostKind: "person" } },
  { id: "pl-guest-d", label: "Польша гости Д", country: "PL", blank: PL_D, items: NUMBERING_D, presets: { purpose: "family", hostKind: "person" } },
  { id: "pl-kp", label: "Польша КП", country: "PL", blank: PL_D, items: { ...NUMBERING_D, kpNumber: 21 }, presets: { purpose: "other", hostKind: "person" } },
  { id: "pl-work", label: "Польша рабочая", country: "PL", blank: PL_D, items: { ...NUMBERING_D, basis: 21, workPermit: 34 }, presets: { purpose: "other", basis: "PRACA" } },
  { id: "bg", label: "Болгария", country: "BG", blank: BG, items: NUMBERING_B, presets: { purpose: "tourism", hostKind: "hotel" } },
]

// The new questionnaire's presets over the data. The city goes only when the list of cities changes with the country.
export function applyQuestionnaire(v: Values, from: Questionnaire, to: Questionnaire): Values {
  const next = { ...v, ...to.presets }
  return CITIES[from.country] === CITIES[to.country] ? next : { ...next, submissionCity: "" }
}

// "28. Дата въезда" by the blank's number, the bare label where the blank prints none.
export function itemLabel(label: string, item: Item | undefined, items: Items): string {
  const n = item && items[item]
  return typeof n === "number" ? `${n}. ${label}` : label
}

// "Пункты 19–20", "Пункт 33" or "" for the numbers of the fields a section shows.
export function itemsNote(numbers: number[]): string {
  if (!numbers.length) return ""
  const lo = Math.min(...numbers), hi = Math.max(...numbers)
  return lo === hi ? `Пункт ${lo}` : `Пункты ${lo}–${hi}`
}

// The options of a choice that the blank has a box for.
export const offered = <T extends Record<string, string>>(blank: Blank, group: string, options: T): Partial<T> =>
  Object.fromEntries(Object.entries(options).filter(([k]) => `${group}.${k}` in blank.ticks)) as Partial<T>
