import { expect, test } from "vitest"
import { ITEM_OF, MEANS, OPTIONS, type Items } from "./anketa"
import { PL_D } from "./blanks/pl-d"
import { PRINT_KEYS } from "./print"
import { applyQuestionnaire, inItemOrder, itemLabel, itemNumber, itemsNote, NUMBERING_A, NUMBERING_B, NUMBERING_D, offered, QUESTIONNAIRES } from "./questionnaire"
import { SPECIMEN } from "./specimen"

const Q = (id: string) => QUESTIONNAIRES.find((q) => q.id === id)!

// A tick key names a real option: `${ChoiceKey}.${option}`, `means.${payer}.${option}` or "sponsorOther".
const isTickKey = (key: string) => {
  const [group, a, b] = key.split(".")
  if (key === "sponsorOther") return true
  if (group === "means") return b !== undefined && b in ((MEANS as Record<string, Record<string, string>>)[a] ?? {})
  return b === undefined && a in ((OPTIONS as Record<string, Record<string, string>>)[group] ?? {})
}

test("item numbers come from the blank's family", () => {
  expect([NUMBERING_D.address, NUMBERING_A.arrival, NUMBERING_B.arrival, NUMBERING_B.fingerprints, NUMBERING_D.submission]).toEqual([17, 28, null, 28, 37])
  expect(Q("pl-kp").items.kpNumber).toBe(21)
  expect([Q("pl-work").items.basis, Q("pl-work").items.workPermit]).toEqual([21, 34])
  expect(Q("pl-guest-d").items).not.toHaveProperty("destination")
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
