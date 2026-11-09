import { expect, test } from "vitest"
import { score, type Case } from "./eval"

const TODAY = new Date("2026-09-28T12:00:00")
const L1 = "P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<"
const L2 = "C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4"
const truth = [L1, L2]

test("score counts a clean read as exact and every field as right", () => {
  const r = score([{ truth, rows: truth }], TODAY)
  expect(r).toMatchObject({ cases: 1, rejected: 0, exact: 1, wrongVerified: 0 })
  expect(r.fields.docNumber).toEqual({ right: 1, wrong: 0 })
})

test("score counts a photo with no MRZ, or no OCR result, as rejected and not as wrong", () => {
  const r = score([{ truth, rows: ["REISEPASS"] }, { truth, rows: null }], TODAY)
  expect(r).toMatchObject({ cases: 2, rejected: 2, exact: 0 })
  expect(r.fields.docNumber).toEqual({ right: 0, wrong: 0 })
})

test("score counts a misread that the check digits cannot see as wrong but verified", () => {
  // "1" (value 1) and "B" (value 11) weigh the same modulo 10: every check digit still passes.
  const swapped = L2.replace("C01", "C0B")
  const r = score([{ truth, rows: [L1, swapped] }], TODAY)
  expect(r).toMatchObject({ exact: 0, wrongVerified: 1 })
  expect(r.fields.docNumber).toEqual({ right: 0, wrong: 1 })
})

test("score does not count a misread already flagged for review as verified", () => {
  // Birth date digit changed: its check digit fails, so the field is marked "check".
  const r = score([{ truth, rows: [L1, L2.replace("6408125", "6408135")] }], TODAY)
  expect(r).toMatchObject({ exact: 0, wrongVerified: 0 })
  expect(r.fields.birthDate).toEqual({ right: 0, wrong: 1 })
})

const value = (c: string) => (c === "<" ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55)
const digit = (s: string) => String([...s].reduce((sum, c, i) => sum + value(c) * [7, 3, 1][i % 3], 0) % 10)

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SURNAMES = ["IVANOVA", "PETROV", "KOVALENKO", "NOVIK", "SIDOROV", "BELSKAYA", "ZAITSEV", "GUSEVA", "OSIPOV", "LEBEDEV"]
const NAMES = ["ANNA", "OLEG", "MARIA", "IGOR", "ELENA", "SERGEI", "OLGA", "BORIS", "IRINA", "DENIS<PAVEL"]
const STATES = ["BLR", "RUS", "KAZ", "UKR", "GEO", "ARM"]
const LETTERS = "ABCEHKMNPX"

// Fictional people only. Every line is built to the ICAO 9303 TD3 layout, so the truth is valid.
function person(rand: () => number): string[] {
  const pick = (from: string | string[]) => from[Math.floor(rand() * from.length)]
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join("")
  const two = (min: number, span: number) => String(min + Math.floor(rand() * span)).padStart(2, "0")
  const state = pick(STATES)
  const number = pick(LETTERS) + pick(LETTERS) + digits(7)
  const birth = two(60, 39) + two(1, 12) + two(1, 28)
  const expiry = two(27, 9) + two(1, 12) + two(1, 28)
  const personal = rand() < 0.5 ? `${digits(7)}A${digits(3)}PB${digits(1)}` : "<".repeat(14)
  const personalCheck = personal[0] === "<" ? "<" : digit(personal)
  const part = `${number}${digit(number)}`
  const dates = [`${birth}${digit(birth)}`, `${expiry}${digit(expiry)}`, `${personal}${personalCheck}`]
  const composite = digit(part + dates.join(""))
  return [
    `P<${state}${pick(SURNAMES)}<<${pick(NAMES)}`.padEnd(44, "<"),
    `${part}${state}${dates[0]}${pick("MF")}${dates[1]}${dates[2]}${composite}`,
  ]
}

const LOOK_ALIKES: Record<string, string> = {
  "0": "OD<", "1": "IB", "2": "Z", "5": "SZ", "6": "G", "8": "BS",
  B: "81", D: "0", G: "6", I: "1", O: "0", S: "58", Z: "25", "<": "KC",
}

// ponytail: invented error rates. Numbers compare two versions of the parser; they say nothing about real photos.
function misread(line: string, rate: number, rand: () => number): string {
  const read = [...line].map((c) => {
    const options = LOOK_ALIKES[c]
    return options && rand() < rate ? options[Math.floor(rand() * options.length)] : c
  })
  if (rand() < 0.3) read.splice(read.lastIndexOf("<"), 1 + Math.floor(rand() * 2))
  return read.join("")
}

function synthetic(rate: number, count = 300): Case[] {
  const rand = random(Math.round(rate * 1e4) + 1)
  return Array.from({ length: count }, () => {
    const truth = person(rand)
    return { truth, rows: truth.map((l) => misread(l, rate, rand)) }
  })
}

test("every synthetic person is a valid MRZ", () => {
  const cases = synthetic(0)
  expect(score(cases.map((c) => ({ truth: c.truth, rows: c.truth })), TODAY)).toMatchObject({ cases: 300, rejected: 0, exact: 300 })
})

// Regression gate for src/lib/mrz.ts: a change to these numbers must be a deliberate one.
test.each([0.005, 0.02, 0.05])("parser baseline on synthetic misreads at rate %d", (rate) => {
  expect(score(synthetic(rate), TODAY)).toMatchSnapshot()
})
