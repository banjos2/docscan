import { expect, test } from "vitest"
import { emptyValues, SCHENGEN } from "./anketa"
import { CITIES } from "./cities"
import { printedText } from "./print"
import { SPECIMEN } from "./specimen"
import { ES } from "./templates/es"

test("printedText puts on paper what the form holds: capitals except e-mail, dates as the template prints them", () => {
  expect(printedText(SPECIMEN, ES)).toMatchObject({
    surname: "MUSTERMANN", firstName: "ERIKA", birthDate: "12-08-1964", issuedBy: "GERMANY",
    address2: "51147 KOELN, GERMANY", email: "erika@example.com", sponsorWho: "MOTHER", place: "MINSK", date: "15-10-2026",
  })
})

test("printedText leaves out empty values and the sponsor when the applicant pays", () => {
  const p = printedText({ ...SPECIMEN, payer: "self", nationalId: "  " }, ES)
  expect(p).not.toHaveProperty("sponsorWho")
  expect(p).not.toHaveProperty("nationalId")
})

test("a new anketa defaults to first entry in Poland and multiple entries, with no submission place or date", () => {
  expect(emptyValues()).toMatchObject({ firstEntry: "PL", entries: "multiple", submissionCity: "", submissionDate: "" })
})

test("printedText writes list choices in the template's language", () => {
  const p = printedText({ ...SPECIMEN, firstEntry: "PL", submissionCity: "moscow", submissionDate: "2026-11-20" }, ES)
  expect(p).toMatchObject({ firstEntry: "POLONIA", place: "MOSCÚ", date: "20-11-2026" })
})

test("printedText prints no city that the template's country doesn't list", () => {
  expect(printedText({ ...SPECIMEN, submissionCity: "pinsk" }, ES)).not.toHaveProperty("place")
})

test("every Schengen state has a name in the template and every printed name fits the PDF font", () => {
  expect(Object.keys(ES.schengen).sort()).toEqual(Object.keys(SCHENGEN).sort())
  const printed = [...Object.values(ES.schengen), ...Object.values(CITIES).flat().map((c) => c.print)]
  for (const s of printed) expect(s).toMatch(/^[\x20-\x7E\xA0-\xFF]+$/)
})
