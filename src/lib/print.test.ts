import { expect, test } from "vitest"
import { emptyValues, EMPLOYMENT, SCHENGEN } from "./anketa"
import { CITIES } from "./cities"
import { addressLines, printedText } from "./print"
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

const REG = { regCountry: "Belarus", regCity: "Minsk", regStreet: "ul. Lenina", regHouse: "5", regFlat: "12", regPostcode: "220030" }
const ACT = { actualCountry: "Belarus", actualCity: "Brest", actualStreet: "ul. Sovetskaya", actualHouse: "1", actualFlat: "", actualPostcode: "224000" }

test("item 19 prints the registered address, or the actual one when it differs", () => {
  expect(printedText({ ...SPECIMEN, ...REG, ...ACT, actualDiffers: "no" }, ES)).toMatchObject({ address1: "UL. LENINA 5-12", address2: "220030 MINSK, BELARUS" })
  expect(printedText({ ...SPECIMEN, ...REG, ...ACT, actualDiffers: "yes" }, ES)).toMatchObject({ address1: "UL. SOVETSKAYA 1", address2: "224000 BREST, BELARUS" })
})

test("an address with missing parts prints without stray commas or dashes", () => {
  expect(addressLines({ country: "Belarus", city: "Minsk", street: "", house: "", flat: "", postcode: "" })).toEqual(["", "Minsk, Belarus"])
  expect(addressLines({ country: "", city: "Minsk", street: "ul. Lenina", house: "5", flat: "", postcode: "220030" })).toEqual(["ul. Lenina 5", "220030 Minsk"])
})

test("item 21 prints the position, or the status in the template's language when no position applies", () => {
  expect(printedText({ ...SPECIMEN, employment: "employed", position: "Engineer" }, ES).profession).toBe("ENGINEER")
  expect(printedText({ ...SPECIMEN, employment: "student", position: "Engineer" }, ES).profession).toBe("ESTUDIANTE")
  expect(printedText({ ...SPECIMEN, employment: "pensioner", position: "" }, ES).profession).toBe("JUBILADO")
})

test("item 22 joins name, address and phone, never the e-mail, and is left out for the unemployed and pensioners", () => {
  const job = { employerName: "Belaz", employerAddress: "Zhodino", employerPhone: "+375 1775 00000", employerEmail: "hr@belaz.example" }
  expect(printedText({ ...SPECIMEN, ...job, employment: "employed" }, ES).employer).toBe("BELAZ, ZHODINO, +375 1775 00000")
  expect(printedText({ ...SPECIMEN, ...job, employment: "pensioner" }, ES)).not.toHaveProperty("employer")
})

test("every employment status has a name in the template", () => {
  expect(Object.keys(ES.employment).sort()).toEqual(Object.keys(EMPLOYMENT).sort())
})
