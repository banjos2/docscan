import { expect, test } from "vitest"
import { printedText } from "./print"
import { SPECIMEN } from "./specimen"
import { ES } from "./templates/es"

test("printedText puts on paper what the form holds: capitals except e-mail, dates as the template prints them", () => {
  expect(printedText(SPECIMEN, ES)).toMatchObject({
    surname: "MUSTERMANN", firstName: "ERIKA", birthDate: "12-08-1964", issuedBy: "GERMANY",
    address2: "51147 KOELN, GERMANY", email: "erika@example.com", sponsorWho: "MOTHER", place: "KOELN", date: "28-09-2026",
  })
})

test("printedText leaves out empty values and the sponsor when the applicant pays", () => {
  const p = printedText({ ...SPECIMEN, payer: "self", nationalId: "  " }, ES)
  expect(p).not.toHaveProperty("sponsorWho")
  expect(p).not.toHaveProperty("nationalId")
})
