import type { Values } from "./anketa"
import { extract, MrzNotFoundError } from "./mrz"

const FIELDS = ["surname", "firstName", "birthDate", "sex", "nationality", "docNumber", "expiryDate", "issuedBy", "nationalId"] as const

// truth: the document's real MRZ lines. rows: what the OCR read, null when it failed outright.
export type Case = { truth: string[]; rows: string[] | null }

// Totals only: this goes to a screen and into a snapshot, so it must never carry a value from a document.
export type Report = {
  cases: number
  rejected: number
  exact: number
  // Read wrong yet shown as confirmed by the MRZ: the number that must stay at zero.
  wrongVerified: number
  fields: Record<(typeof FIELDS)[number], { right: number; wrong: number }>
}

export function score(cases: Case[], today = new Date()): Report {
  const fields = Object.fromEntries(FIELDS.map((f) => [f, { right: 0, wrong: 0 }])) as Report["fields"]
  const report: Report = { cases: cases.length, rejected: 0, exact: 0, wrongVerified: 0, fields }
  for (const { truth, rows } of cases) {
    const read = readRows(rows, today)
    if (!read) {
      report.rejected++
      continue
    }
    const want: Partial<Values> = extract(truth, today).values
    const wrong = FIELDS.filter((f) => read.values[f] !== want[f])
    for (const f of FIELDS) fields[f][wrong.includes(f) ? "wrong" : "right"]++
    if (!wrong.length) report.exact++
    report.wrongVerified += wrong.filter((f) => read.sources[f] === "mrz").length
  }
  return report
}

function readRows(rows: string[] | null, today: Date) {
  if (!rows) return null
  try {
    return extract(rows, today)
  } catch (e) {
    if (e instanceof MrzNotFoundError) return null
    throw e
  }
}
