import { expect, test } from "vitest"
import { ITEM_OF, MEANS, OPTIONS, type Items, type Values } from "./anketa"
import { PL_D } from "./blanks/pl-d"
import { PRINT_KEYS, type PrintKey } from "./print"
import { applyQuestionnaire, inItemOrder, itemLabel, itemNumber, itemsNote, NUMBERING_A, NUMBERING_B, NUMBERING_D, offered, prints, QUESTIONNAIRES } from "./questionnaire"
import { SPECIMEN } from "./specimen"

const Q = (id: string) => QUESTIONNAIRES.find((q) => q.id === id)!

// A tick key names a real option: `${ChoiceKey}.${option}`, `means.${payer}.${option}` or "sponsorOther".
const isTickKey = (key: string) => {
  const [group, a, b] = key.split(".")
  if (key === "sponsorOther") return true
  if (group === "means") return b !== undefined && b in ((MEANS as Record<string, Record<string, string>>)[a] ?? {})
  return b === undefined && a in ((OPTIONS as Record<string, Record<string, string>>)[group] ?? {})
}

test("the ten questionnaires: order, country, item numbers and presets as the spec's tables give them", () => {
  // «Номера пунктов»: blanks A, B and D (D has no destination: the blank prints «ПОЛЬША»).
  const A = { address: 19, residence: 20, occupation: 21, employer: 22, purpose: 23, destination: 25, firstEntry: 26, entries: 27,
    arrival: 28, departure: 28, fingerprints: 29, host: 31, org: 32, costs: 33, submission: null }
  const B = { ...A, arrival: null, departure: null, fingerprints: 28, host: 30, org: 31, costs: 32 }
  const D = { address: 17, residence: 18, occupation: 19, employer: 20, purpose: 21, firstEntry: 23, entries: 24, prevVisas: 26,
    fingerprints: 27, arrival: 29, departure: 30, host: 31, org: 32, costs: 33, submission: 37 }
  expect([NUMBERING_A, NUMBERING_B, NUMBERING_D]).toEqual([A, B, D])
  // «Анкеты и бланки» and «Предустановки».
  const tour = { purpose: "tourism", hostKind: "hotel" }
  expect(QUESTIONNAIRES.map((q) => [q.id, q.country, q.items, q.presets])).toEqual([
    ["pl-s", "PL", B, tour],
    ["pl-guest-s", "PL", B, { purpose: "tourism", hostKind: "person" }],
    ["pl-guest-d", "PL", D, { purpose: "family", hostKind: "person" }],
    ["pl-kp", "PL", { ...D, kpNumber: 21 }, { purpose: "other", hostKind: "person" }],
    ["pl-work", "PL", { ...D, basis: 21, workPermit: 34 }, { purpose: "other", basis: "PRACA" }],
    ["bg", "BG", B, tour],
    ["hu", "HU", A, tour],
    ["gr", "GR", B, tour],
    ["es", "ES", A, tour],
    ["it", "IT", A, tour],
  ])
})

test("a label takes its number from the blank and has none where the blank prints none", () => {
  expect(itemLabel("Дата въезда", "arrival", NUMBERING_A)).toBe("28. Дата въезда")
  expect(itemLabel("Дата въезда", "arrival", NUMBERING_B)).toBe("Дата въезда")
  expect(itemLabel("Дата въезда", "arrival", NUMBERING_D)).toBe("29. Дата въезда")
  expect(itemLabel("1. Фамилия", undefined, NUMBERING_D)).toBe("1. Фамилия")
})

test("a section's fields follow the blank's item numbers, an unnumbered one staying after the field before it", () => {
  // «Поездка» in the form's own order.
  const trip = ["purpose", "kpNumber", "basis", "destination", "firstEntry", "entries", "prevVisas", "prevVisa1From", "prevVisa1To",
    "arrivalDate", "departureDate", "fingerprints"] as const
  const order = (items: Items) => inItemOrder(trip.filter((key) => items[ITEM_OF[key]!] !== undefined).map((key) => ({ key })), items).map((f) => f.key)
  expect(order(Q("pl-kp").items)).toEqual(["purpose", "kpNumber", "firstEntry", "entries", "prevVisas", "prevVisa1From", "prevVisa1To", "fingerprints", "arrivalDate", "departureDate"])
  expect(order(Q("pl-kp").items).map((key) => itemNumber(ITEM_OF[key], Q("pl-kp").items))).toEqual([21, 21, 23, 24, 26, 26, 26, 27, 29, 30])
  expect(order(Q("pl-work").items)).toEqual(["purpose", "basis", "firstEntry", "entries", "prevVisas", "prevVisa1From", "prevVisa1To", "fingerprints", "arrivalDate", "departureDate"])
  // A and B as before: B's dates print inside item 27, without a number.
  expect(order(NUMBERING_A)).toEqual(["purpose", "destination", "firstEntry", "entries", "arrivalDate", "departureDate", "fingerprints"])
  expect(order(NUMBERING_B)).toEqual(["purpose", "destination", "firstEntry", "entries", "arrivalDate", "departureDate", "fingerprints"])
})

test("a section note spans the numbers its fields show", () => {
  expect([itemsNote([19, 20, 19]), itemsNote([33]), itemsNote([])]).toEqual(["Пункты 19–20", "Пункт 33", ""])
})

test("switching applies the new questionnaire's presets and keeps everything else", () => {
  expect(applyQuestionnaire({ ...SPECIMEN, purpose: "tourism" }, Q("pl-guest-d"), Q("pl-work"))).toMatchObject({ purpose: "other", basis: "PRACA", surname: "Mustermann" })
})

test("the submission city resets only when the list of cities changes", () => {
  const pl = Q("pl-guest-d"), v = { ...SPECIMEN, submissionCity: "brest" }
  expect(applyQuestionnaire(v, pl, { ...pl, country: "HU" }).submissionCity).toBe("brest")
  expect(applyQuestionnaire(v, pl, { ...pl, country: "GR" }).submissionCity).toBe("")
})

test("a select offers only the options the blank can tick", () => {
  expect(Object.keys(offered(PL_D, "sex", OPTIONS.sex))).toEqual(["M", "F"])
  expect(offered(PL_D, "maritalStatus", OPTIONS.maritalStatus)).not.toHaveProperty("partnership")
  expect(offered(PL_D, "purpose", OPTIONS.purpose)).not.toHaveProperty("transit")
})

test("every blank names only real print keys and real options", () => {
  for (const { blank } of QUESTIONNAIRES) {
    for (const spec of Object.values(blank.text)) for (const k of spec.split("+")) expect(PRINT_KEYS).toContain(k)
    for (const key of Object.keys(blank.ticks)) expect(isTickKey(key)).toBe(true)
  }
})

test("every field the form can show prints on its questionnaire's blank, but Болгария's sponsor, which has no line", () => {
  // The form's fields that are print keys themselves, on the questionnaires that have their item.
  const fields = PRINT_KEYS.filter((k): k is PrintKey & keyof Values => k in SPECIMEN)
  const unprinted = QUESTIONNAIRES.flatMap((q) =>
    fields.filter((k) => (!ITEM_OF[k] || ITEM_OF[k] in q.items) && !prints(q.blank, k)).map((k) => `${q.id} ${k}`))
  expect(unprinted).toEqual(["bg sponsorWho"])
  // A cell of two keys prints both.
  expect([prints(PL_D, "hostEmail"), prints(PL_D, "destination")]).toEqual([true, false])
})
