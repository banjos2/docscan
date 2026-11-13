import { parse, states } from "mrz"
import { realIso, type Source, type Sources, type Values } from "./anketa"

export class MrzNotFoundError extends Error {
  constructor() {
    super("MRZ не найдена. Сфотографируйте страницу с фото целиком, без бликов на машиночитаемых строках внизу.")
  }
}

type Parsed = ReturnType<typeof parse>

// What the OCR thought of one character: [best, its probability, runner-up, its probability].
export type Candidate = [string, number, string, number]
// Rows of text, plus the per-character candidates of the rows read with the MRZ alphabet (keyed by the row without spaces).
export type Rows = string[] & { alts?: Record<string, Candidate[]> }

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

type Found = { parsed: Parsed; resized: Set<number>; window: string[]; n: number }

const words = (s: string) => s.split(/[^A-Z]+/).filter(Boolean)

// The words of the printed page, for a second opinion on the names. MRZ rows are out: they are the same print read twice.
function printedWords(rows: string[]): Set<string> {
  return new Set(rows.filter((r) => !/[<«»‹›≪くㄑ〈＜]/.test(r) && normalize(r) === null).flatMap((r) => words(r.toUpperCase())))
}

// ponytail: 5% is a guess at what counts as "the model considered it"; calibrate on the real photo set.
const MIN_RUNNER_UP = 0.05
const CHECKED_FIELDS = ["documentNumber", "birthDate", "expirationDate", "personalNumber"]
// Letters and digits OCR swaps while sure of itself, tried only on a field whose check digit already failed.
const LOOK_ALIKES: Record<string, string> = { O: "0", D: "0", Q: "0", "0": "O", I: "1", "1": "I", Z: "2", "2": "Z", S: "5", "5": "S", G: "6", "6": "G", B: "8", "8": "B" }
const charValue = (c: string) => (c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55)
const passes = (text: string, digit: string) =>
  String([...text].reduce((sum, c, i) => sum + charValue(c) * [7, 3, 1][i % 3], 0) % 10) === digit.replace("<", "0")

// Check digits see only one thing: the sum. So a runner-up that also satisfies one is evidence of doubt about a field
// that passed, and the only way to repair a field that failed: when exactly one does. Either way a person must look.
function weighRunnerUps(found: Found, alts: NonNullable<Rows["alts"]>): Found & { doubtful: Set<string> } {
  const fitted = found.window.map((l) => fitLength(l, found.n))
  const doubtful = new Set<string>()
  const fixes: { line: number; at: number; char: string }[] = []
  for (const field of CHECKED_FIELDS) {
    const d = found.parsed.details.find((x) => x.field === field)
    const check = found.parsed.details.find((x) => x.field === `${field}CheckDigit`)
    if (!d || !check) continue
    const { line, start, end } = d.ranges[0]
    const digit = fitted[check.ranges[0].line][check.ranges[0].start]
    const text = fitted[line].slice(start, end)
    const isDate = field === "birthDate" || field === "expirationDate"
    const fits = (at: number, char: string) => {
      const changed = text.slice(0, at - start) + char + text.slice(at - start + 1)
      return (!isDate || /^\d+$/.test(changed)) && passes(changed, digit)
    }
    const options: typeof fixes = []
    for (let at = start; at < end; at++) {
      // The guard also skips characters shifted out of place by a resized line.
      const [best, , char, p] = alts[found.window[line]]?.[at] ?? []
      if (best !== fitted[line][at] || !char || (p ?? 0) < MIN_RUNNER_UP) continue
      if (fits(at, char)) options.push({ line, at, char })
    }
    if (!check.valid && !options.length) {
      for (let at = start; at < end; at++) {
        const char = LOOK_ALIKES[fitted[line][at]]
        if (char && fits(at, char)) options.push({ line, at, char })
      }
    }
    if (check.valid ? options.length : options.length === 1) doubtful.add(field)
    if (!check.valid && options.length === 1) fixes.push(options[0])
  }
  if (!fixes.length) return { ...found, doubtful }
  for (const { line, at, char } of fixes) fitted[line] = fitted[line].slice(0, at) + char + fitted[line].slice(at + 1)
  return { ...found, parsed: parse(fitted, { autocorrect: true }), doubtful }
}

function findMrz(rows: Rows): Found & { printed: Set<string>; doubtful: Set<string> } {
  const lines = rows.map(normalize).filter((l): l is string => l !== null)
  const printed = printedWords(rows)
  const score = (r: Parsed) => r.details.filter((d) => d.valid).length
  const nameWords = ({ fields: f }: Parsed) => words(`${f.lastName ?? ""} ${f.firstName ?? ""}`)
  // ponytail: more letters beats fewer because OCR mostly drops letters; a real photo set may show otherwise.
  const namesQuality = (r: Parsed) => nameWords(r).filter((w) => printed.has(w)).length * 100 + nameWords(r).join("").length

  const attempt = (window: string[], n: number, namesAt: number): Found | null => {
    try {
      const parsed = parse(window.map((l) => fitLength(l, n)), { autocorrect: true })
      // No check digit covers the names, so a line of printed text could pass for them next to a real
      // line 2: the name line needs its "<<" separator (before fitLength invents one) and a valid document code.
      if (!window[namesAt].includes("<<") || !parsed.details.find((d) => d.field === "documentCode")?.valid) return null
      return { parsed, resized: new Set(window.flatMap((l, line) => (l.length === n ? [] : [line]))), window, n }
    } catch {
      return null // not this format
    }
  }

  let best: Found | null = null
  for (const [n, count] of FORMATS) {
    const namesAt = count === 3 ? 2 : 0
    for (let i = 0; i + count <= lines.length; i++) {
      const window = lines.slice(i, i + count)
      // The name line may be the only read of it and short of any number of fillers, which fitLength restores (a
      // photocopy's line 1 came back with 12 of its 25); the lines under check digits may not stray that far.
      if (window.some((l, at) => (at === namesAt ? l.length > n + 4 : Math.abs(l.length - n) > 4))) continue
      const first = attempt(window, n, namesAt)
      if (!first) continue
      // The page and the zoomed band each read the name line, and check digits cannot say which read is right.
      // A read may lose any number of fillers: fitLength restores them.
      const reads = lines.filter((l) => l.length <= n + 4)
      let found = first
      for (let at = 0; at < count; at++) {
        for (const line of reads) {
          const other = attempt(found.window.with(at, line), n, namesAt)
          if (!other) continue
          const gain = score(other.parsed) - score(found.parsed)
          if (at === namesAt ? gain >= 0 && namesQuality(other.parsed) > namesQuality(found.parsed) : gain > 0) found = other
        }
      }
      if (!best || score(found.parsed) > score(best.parsed)) best = found
    }
  }
  if (!best) throw new MrzNotFoundError()
  return { ...weighRunnerUps(best, rows.alts ?? {}), printed }
}

// How an OCR read could have turned the printed word into `word`: by dropping letters and by taking one letter for
// another, two such slips at most. Returns the letters taken for another as [index in word, printed letter], or null
// when it could not (a read does not add letters).
function slips(word: string, printedWord: string): [number, string][] | null {
  const dropped = printedWord.length - word.length
  if (dropped < 0 || dropped > 2 || word.length < 4) return null
  let best: [number, string][] | null = null
  const without = (p: string, drops: number, from: number) => {
    if (drops) {
      for (let i = from; i < p.length; i++) without(p.slice(0, i) + p.slice(i + 1), drops - 1, i)
      return
    }
    const swapped = [...word].flatMap((c, i): [number, string][] => (c === p[i] ? [] : [[i, p[i]]]))
    if (swapped.length + dropped <= 2 && (!best || swapped.length < best.length)) best = swapped
  }
  without(printedWord, dropped, 0)
  return best
}

// No check digit covers the names, so a misread name still parses as one: a scan's "I" came out as "Z" in every
// read, and its first letter was lost in some. The printed page spells the name in other print. When exactly one of
// its words explains the MRZ's word as such a read, the printed word is taken: a dropped letter needs no more
// proof (it is what OCR does most), a letter taken for another needs a read of the MRZ that backs the printed one
// (it read it there, or it was a runner-up the model considered). `others` are the MRZ's other name words: IVAN is
// not a misread IVANOV.
function repairName(name: string, others: string[], printed: Set<string>, alts: NonNullable<Rows["alts"]>): string {
  return name.replace(/[A-Z]+/g, (word) => {
    if (printed.has(word)) return word
    const near = [...printed].flatMap((p) => {
      const swapped = p === word || others.includes(p) ? null : slips(word, p)
      return swapped ? [{ fix: p, swapped }] : []
    })
    if (near.length !== 1) return word
    // The reads differ in length and in what they lost, so a letter is found by its neighbours, not its index:
    // up to two on each side, three in all where the word has them (a read may have lost one of the four).
    const backed = ([at, letter]: [number, string]) =>
      [0, 1, 2].some((l) =>
        [0, 1, 2].some((r) => {
          if (l > at || r > word.length - 1 - at || l + r < Math.min(3, word.length - 1)) return false
          const around = (c: string) => word.slice(at - l, at) + c + word.slice(at + 1, at + 1 + r)
          return Object.entries(alts).some(([row, chars]) => {
            if (row.includes(around(letter))) return true
            for (let i = row.indexOf(around(word[at])); i >= 0; i = row.indexOf(around(word[at]), i + 1)) {
              const [, , runnerUp, p] = chars[i + l] ?? []
              if (runnerUp === letter && p >= MIN_RUNNER_UP) return true
            }
            return false
          })
        }),
      )
    return near[0].swapped.every(backed) ? near[0].fix : word
  })
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

export function extract(rows: Rows, today = new Date()): { values: Partial<Values>; sources: Sources } {
  const { parsed: r, resized, printed, doubtful } = findMrz(rows)
  const fields = r.fields as Record<string, string | null | undefined>
  const detail = (field: string) => r.details.find((d) => d.field === field)
  // Invalid fields come back as null; fall back to the raw characters so the user can fix them.
  // `raw` exists at runtime but is missing from the mrz package's Range type.
  const raw = (field: string) => (detail(field)?.ranges[0] as { raw?: string } | undefined)?.raw?.replace(/</g, " ")
  const text = (field: string) => (fields[field] ?? raw(field) ?? "").trim()
  // Needs review if the field or its check digit failed, or the parser had to autocorrect it.
  // Without a check digit, nothing vouches for a field on a line fitLength had to resize.
  const src = (field: string): Source => {
    const d = detail(field)
    const check = detail(`${field}CheckDigit`)
    const confirmed = check ? check.valid : !resized.has(d?.ranges[0].line ?? -1)
    return d?.valid && confirmed && !d.autocorrect?.length && !doubtful.has(field) ? "mrz" : "check"
  }

  // No check digit covers the names, and a misread letter still parses as a name: only the printed page can confirm
  // one, and only as the MRZ read it. A name repaired from the printed page is for a person to look at.
  const nameSrc = (field: string, name: string): Source =>
    name === text(field) && words(name).length && words(name).every((w) => w.length > 1 && printed.has(w)) ? "mrz" : "check"

  const read = { surname: text("lastName"), firstName: text("firstName") }
  const surname = repairName(read.surname, words(read.firstName), printed, rows.alts ?? {})
  const firstName = repairName(read.firstName, words(read.surname), printed, rows.alts ?? {})
  const nationality = country(text("nationality"))
  const personal = fields.personalNumber !== undefined ? "personalNumber" : "optional2"
  // Anything other than male/female (unspecified, or missing) needs a manual choice, not a guess.
  const sex = fields.sex === "male" ? "M" : fields.sex === "female" ? "F" : ""
  const values: Partial<Values> = {
    surname,
    surnameAtBirth: surname,
    firstName,
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
    surname: nameSrc("lastName", surname),
    firstName: nameSrc("firstName", firstName),
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

// ponytail: heuristic — the issue date is the only printed date that is neither birth nor expiry, or failing that, the
// first of those after its English/French label. Handles dd.mm.yyyy (with or without its separators) and "dd MON[/MON] yy(yy)"; anything else stays manual.
export function findIssueDate(rows: string[], birth: string, expiry: string): string {
  const text = rows.join("\n").toUpperCase()
  const found: { date: string; at: number }[] = []
  // The separators are optional: OCR runs the spaced digits of a scan together ("07 082026").
  for (const m of text.matchAll(/\b(\d{2})[./\- ]?(\d{2})[./\- ]?(\d{4})\b/g)) {
    const [, d, mm, y] = m
    if (+mm >= 1 && +mm <= 12 && +d >= 1 && +d <= 31) found.push({ date: `${y}-${mm}-${d}`, at: m.index })
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s*(?:[^\s/\d]{3,4}\.?\s*\/\s*)?([A-Z]{3})\.?(?:\s*\/\s*[^\s/\d]{3,4}\.?)?\s*(\d{4}|\d{2})\b/g)) {
    const [, d, mon, y] = m
    const month = MONTHS.indexOf(mon) + 1
    if (month) found.push({ date: `${y.length === 2 ? `20${y}` : y}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}`, at: m.index })
  }
  // realIso drops an OCR misread like 31.02, which the day/month ranges above let through.
  const rest = found.filter(({ date }) => realIso(date) && date > birth && (!expiry || date < expiry))
  if (new Set(rest.map((f) => f.date)).size === 1) return rest[0].date
  const label = text.search(/DATE OF ISSUE|ISSUE DATE|DATE DE D[EÉ]LIVRANCE/)
  if (label < 0) return ""
  return rest.filter((f) => f.at > label).sort((a, b) => a.at - b.at)[0]?.date ?? ""
}
