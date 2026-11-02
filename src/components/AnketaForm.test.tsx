import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import type { Values } from "../lib/anketa"
import { QUESTIONNAIRES } from "../lib/questionnaire"
import { SPECIMEN } from "../lib/specimen"
import { AnketaForm } from "./AnketaForm"

const Q = (id: string) => QUESTIONNAIRES.find((q) => q.id === id)!
const render = (values: Values, id: string) =>
  renderToStaticMarkup(<AnketaForm values={values} sources={{}} errors={{}} questionnaire={Q(id)} onChange={() => {}} onQuestionnaire={() => {}} />)

const NO_LINE = "В этом бланке для этого поля нет строки: в PDF оно не печатается."

test("a field its blank has no line for says it doesn't print: only Болгария's sponsor", () => {
  // Every item 26 period shows once the one before it has dates.
  const periods = Object.fromEntries([1, 2, 3, 4, 5].flatMap((n) => [[`prevVisa${n}From`, "2024-01-01"], [`prevVisa${n}To`, "2024-01-10"]]))
  const v = { ...SPECIMEN, prevVisas: "yes", ...periods }
  for (const q of QUESTIONNAIRES) {
    const notes = [...render(v, q.id).matchAll(/<p id="field-(\w+)-unprinted"[^>]*>([^<]*)<\/p>/g)].map((m) => `${m[1]}: ${m[2]}`)
    expect(notes, q.id).toEqual(q.id === "bg" ? [`sponsorWho: ${NO_LINE}`] : [])
  }
})

test("a choice kept from another questionnaire that this blank can't tick shows «Выберите», not an empty select", () => {
  // Польша гости Д has no box for sex "X" (Болгария has); validate still stops the PDF on it.
  const trigger = /<button[^>]*id="field-sex"[^>]*>(.*?)<\/button>/.exec(render({ ...SPECIMEN, sex: "X" }, "pl-guest-d"))?.[1] ?? ""
  expect(trigger).toContain("Выберите")
})
