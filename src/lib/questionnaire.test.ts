import { expect, test } from "vitest"
import { MEANS, OPTIONS } from "./anketa"
import { PL_D } from "./blanks/pl-d"
import { PRINT_KEYS } from "./print"
import { applyQuestionnaire, NUMBERING_A, NUMBERING_B, NUMBERING_D, offered, QUESTIONNAIRES } from "./questionnaire"
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
