import { parse, states } from "mrz"
import { realIso, type Source, type Sources, type Values } from "./anketa"

export class MrzNotFoundError extends Error {
  constructor() {
    super("MRZ не найдена. Сфотографируйте страницу с фото целиком, без бликов на машиночитаемых строках внизу.")
  }
}

type Parsed = ReturnType<typeof parse>

// [line length, line count] for TD3 (passport), TD2 and TD1 (ID card).
const FORMATS = [[44, 2], [36, 2], [30, 3]] as const
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

// OCR reads the "<" filler as look-alike glyphs; « and ≪ usually stand for two of them.
function normalize(row: string): string | null {
  const s = row.toUpperCase().replace(/\s+/g, "")
  const good = s.match(/[A-Z0-9<«»‹›≪くㄑ〈＜]/g)?.length ?? 0
  if (s.length < 26 || good / s.length < 0.9) return null
  return s.replace(/[«»≪]/g, "<<").replace(/[^A-Z0-9]/g, "<")
}

// Missing or extra fillers: stretch or shrink the longest "<" run to the expected length.
function fitLength(s: string, n: number): string {
  const run = [...s.matchAll(/<+/g)].sort((a, b) => b[0].length - a[0].length)[0]
  if (!run || s.length === n) return s
  const at = run.index ?? 0
  const len = Math.max(0, run[0].length + n - s.length)
  return s.slice(0, at) + "<".repeat(len) + s.slice(at + run[0].length)
}

function findMrz(rows: string[]): Parsed {
  const lines = rows.map(normalize).filter((l): l is string => l !== null)
  const score = (r: Parsed) => r.details.filter((d) => d.valid).length
  let best: Parsed | null = null
  for (const [n, count] of FORMATS) {
    for (let i = 0; i + count <= lines.length; i++) {
      const window = lines.slice(i, i + count)
      if (window.some((l) => Math.abs(l.length - n) > 4)) continue
      try {
        const r = parse(window.map((l) => fitLength(l, n)), { autocorrect: true })
        // No check digit covers the names, so a line of printed text could pass for them next to a real
        // line 2: the name line needs its "<<" separator (before fitLength invents one) and a valid document code.
        const names = window[count === 3 ? 2 : 0]
        if (!names.includes("<<") || !r.details.find((d) => d.field === "documentCode")?.valid) continue
        if (!best || score(r) > score(best)) best = r
      } catch {
        // not this format
      }
    }
  }
  if (!best) throw new MrzNotFoundError()
  return best
}

const country = (code: string) => {
  const name = (states as Record<string, string>)[code]
  return name ? name.replace(/\s*\(the\)$/i, "").toUpperCase() : code
}

// YYMMDD → yyyy-mm-dd. Expiry dates are always 20xx; birth dates later than this year are 19xx.
// A failed check digit falls back to the raw digits (see `text` in extract()), which can be an
// impossible date (e.g. day 87): only return it once it round-trips through Date.
function isoFromMrz(s: string, expiry: boolean, today: Date): string {
  if (!/^\d{6}$/.test(s)) return ""
  const yy = Number(s.slice(0, 2))
  const century = expiry || yy <= today.getFullYear() % 100 ? 2000 : 1900
  return realIso(`${century + yy}-${s.slice(2, 4)}-${s.slice(4, 6)}`)
}

export function extract(rows: string[], today = new Date()): { values: Partial<Values>; sources: Sources } {
  const r = findMrz(rows)
  const fields = r.fields as Record<string, string | null | undefined>
  const detail = (field: string) => r.details.find((d) => d.field === field)
  // Invalid fields come back as null; fall back to the raw characters so the user can fix them.
  // `raw` exists at runtime but is missing from the mrz package's Range type.
  const raw = (field: string) => (detail(field)?.ranges[0] as { raw?: string } | undefined)?.raw?.replace(/</g, " ")
  const text = (field: string) => (fields[field] ?? raw(field) ?? "").trim()
  // Needs review if the field or its check digit failed, or the parser had to autocorrect it.
  const src = (field: string): Source => {
    const d = detail(field)
    const check = detail(`${field}CheckDigit`)
    return d?.valid && (check?.valid ?? true) && !d.autocorrect?.length ? "mrz" : "check"
  }

  const surname = text("lastName")
  const nationality = country(text("nationality"))
  const personal = fields.personalNumber !== undefined ? "personalNumber" : "optional2"
  // Anything other than male/female (unspecified, or missing) needs a manual choice, not a guess.
  const sex = fields.sex === "male" ? "M" : fields.sex === "female" ? "F" : ""
  const values: Partial<Values> = {
    surname,
    surnameAtBirth: surname,
    firstName: text("firstName"),
    birthDate: isoFromMrz(text("birthDate"), false, today),
    countryOfBirth: nationality,
    nationality,
    nationalityAtBirth: nationality,
    sex,
    nationalId: text(personal),
    docType: fields.documentCode?.startsWith("P") ? (fields.documentCode === "PD" ? "diplomatic" : "ordinary") : "other",
    docNumber: r.documentNumber ?? text("documentNumber"),
    expiryDate: isoFromMrz(text("expirationDate"), true, today),
    issuedBy: country(text("issuingState")),
  }
  const sources: Sources = {
    surname: src("lastName"),
    firstName: src("firstName"),
    birthDate: src("birthDate"),
    sex: sex ? src("sex") : "check",
    nationality: src("nationality"),
    docType: src("documentCode"),
    docNumber: src("documentNumber"),
    expiryDate: src("expirationDate"),
    issuedBy: src("issuingState"),
    // Assumed equal to the MRZ values: most people keep them, but the user must confirm.
    surnameAtBirth: "check",
    countryOfBirth: "check",
    nationalityAtBirth: "check",
  }
  if (values.nationalId) sources.nationalId = src(personal)

  // Always set (never left over from a previous scan); only flagged for review when actually found.
  const issueDate = findIssueDate(rows, values.birthDate ?? "", values.expiryDate ?? "")
  values.issueDate = issueDate
  if (issueDate) sources.issueDate = "check"
  return { values, sources }
}

// ponytail: heuristic — the issue date is the only printed date that is neither birth nor expiry.
// Handles dd.mm.yyyy and "dd MON[/MON] yy(yy)" with English month names; anything else stays manual.
export function findIssueDate(rows: string[], birth: string, expiry: string): string {
  const text = rows.join("\n").toUpperCase()
  const found = new Set<string>()
  for (const [, d, m, y] of text.matchAll(/\b(\d{2})[./\- ](\d{2})[./\- ](\d{4})\b/g)) {
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) found.add(`${y}-${m}-${d}`)
  }
  for (const [, d, mon, y] of text.matchAll(
    /\b(\d{1,2})\s*(?:[^\s/\d]{3,4}\.?\s*\/\s*)?([A-Z]{3})\.?(?:\s*\/\s*[^\s/\d]{3,4}\.?)?\s*(\d{4}|\d{2})\b/g,
  )) {
    const m = MONTHS.indexOf(mon) + 1
    if (m) found.add(`${y.length === 2 ? `20${y}` : y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`)
  }
  // realIso drops an OCR misread like 31.02, which the day/month ranges above let through.
  const rest = [...found].filter((d) => realIso(d) && d > birth && (!expiry || d < expiry))
  return rest.length === 1 ? rest[0] : ""
}
