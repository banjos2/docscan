import { expect, test } from "vitest"
import { emptyValues, SCHENGEN } from "./anketa"
import { CITIES } from "./cities"
import { addressLine, cellText, COUNTRY_EN, printedText, stayDays, STATUS_EN } from "./print"
import { QUESTIONNAIRES } from "./questionnaire"
import { SPECIMEN } from "./specimen"

const Q = (id: string) => QUESTIONNAIRES.find((q) => q.id === id)!

test("printedText puts on paper what the form holds: capitals except e-mail, dates as dd-mm-yyyy", () => {
  expect(printedText(SPECIMEN, Q("pl-guest-d"))).toMatchObject({
    surname: "MUSTERMANN", firstName: "ERIKA", birthDate: "12-08-1964", issuedBy: "GERMANY",
    address: "GERMANY, 51147, KOELN, HEIDESTRASSE 17", email: "erika@example.com", sponsorWho: "MOTHER", place: "MINSK", date: "15-10-2026",
  })
})

test("printedText leaves out empty values and the sponsor when the applicant pays", () => {
  const p = printedText({ ...SPECIMEN, payer: "self", nationalId: "  " }, Q("pl-guest-d"))
  expect(p).not.toHaveProperty("sponsorWho")
  expect(p).not.toHaveProperty("nationalId")
})

test("a new anketa defaults to first entry in Poland and multiple entries, with no submission place or date", () => {
  expect(emptyValues()).toMatchObject({ firstEntry: "PL", entries: "multiple", prevVisas: "no", submissionCity: "", submissionDate: "" })
})

test("printedText prints no city that the questionnaire's country doesn't list", () => {
  const es = { ...Q("pl-guest-d"), country: "ES" as const }
  expect(printedText({ ...SPECIMEN, submissionCity: "pinsk" }, es)).not.toHaveProperty("place")
  expect(printedText({ ...SPECIMEN, submissionCity: "moscow" }, es).place).toBe("MOSCOW")
})

const REG = { regCountry: "Belarus", regCity: "Minsk", regStreet: "ul. Lenina", regHouse: "5", regFlat: "12", regPostcode: "220030" }
const ACT = { actualCountry: "Belarus", actualCity: "Brest", actualStreet: "ul. Sovetskaya", actualHouse: "1", actualFlat: "", actualPostcode: "224000" }

test("the address prints as one line: country, postcode, city, street house-flat", () => {
  expect(printedText({ ...SPECIMEN, ...REG }, Q("pl-guest-d")).address).toBe("BELARUS, 220030, MINSK, UL. LENINA 5-12")
  expect(addressLine({ country: "Belarus", city: "Minsk", street: "", house: "", flat: "", postcode: "" })).toBe("Belarus, Minsk")
})

test("the address is the registered one, or the actual one when it differs", () => {
  expect(printedText({ ...SPECIMEN, ...REG, ...ACT, actualDiffers: "no" }, Q("pl-guest-d")).address).toBe("BELARUS, 220030, MINSK, UL. LENINA 5-12")
  expect(printedText({ ...SPECIMEN, ...REG, ...ACT, actualDiffers: "yes" }, Q("pl-guest-d")).address).toBe("BELARUS, 224000, BREST, UL. SOVETSKAYA 1")
})

test("an address with missing parts prints without stray commas or dashes", () => {
  expect(addressLine({ country: "", city: "Minsk", street: "ul. Lenina", house: "5", flat: "", postcode: "220030" })).toBe("220030, Minsk, ul. Lenina 5")
})

test("list choices print in English in every questionnaire", () => {
  const p = printedText({ ...SPECIMEN, firstEntry: "PL", submissionCity: "minsk", employment: "student", position: "" }, Q("pl-guest-d"))
  expect(p).toMatchObject({ firstEntry: "POLAND", place: "MINSK", profession: "STUDENT" })
  expect(printedText({ ...SPECIMEN, employment: "pensioner", position: "" }, Q("pl-work")).profession).toBe("PENSIONER")
})

test("the occupation prints the position, or the status when no position applies", () => {
  expect(printedText({ ...SPECIMEN, employment: "employed", position: "Engineer" }, Q("pl-guest-d")).profession).toBe("ENGINEER")
  expect(printedText({ ...SPECIMEN, employment: "student", position: "Engineer" }, Q("pl-guest-d")).profession).toBe("STUDENT")
})

test("the employer joins name, address and phone, never the e-mail, and is left out for the unemployed and pensioners", () => {
  const job = { employerName: "Belaz", employerAddress: "Zhodino", employerPhone: "+375 1775 00000", employerEmail: "hr@belaz.example" }
  expect(printedText({ ...SPECIMEN, ...job, employment: "employed" }, Q("pl-guest-d")).employer).toBe("BELAZ, ZHODINO, +375 1775 00000")
  expect(printedText({ ...SPECIMEN, ...job, employment: "pensioner" }, Q("pl-guest-d"))).not.toHaveProperty("employer")
})

test("a pasted tab prints as a space and a Windows or old Mac line end as a plain one", () => {
  const job = { employment: "employed", employerName: "Poltrans\tSp. z o.o.", employerAddress: "ul. Polna 7\r\n62-800 Kalisz\rPoland", employerPhone: "" }
  expect(printedText({ ...SPECIMEN, ...job }, Q("pl-guest-d")).employer).toBe("POLTRANS SP. Z O.O., UL. POLNA 7\n62-800 KALISZ\nPOLAND")
})

test("item 25 counts the days of the stay, arrival and departure included", () => {
  expect(stayDays("2026-11-02", "2026-11-16")).toBe("15")
  expect(stayDays("2026-11-16", "2026-11-02")).toBe("")
  expect(stayDays("2026-11-02", "")).toBe("")
})

test("the Karta Polaka number and the basis print only where the questionnaire has them", () => {
  const v = { ...SPECIMEN, kpNumber: "ab123", basis: "praca" }
  expect(printedText(v, Q("pl-kp")).purposeOther).toBe("KARTA POLAKA AB123")
  expect(printedText(v, Q("pl-work")).basis).toBe("PRACA")
  expect(printedText(v, Q("pl-guest-d"))).not.toHaveProperty("purposeOther")
  expect(printedText(v, Q("pl-guest-d"))).not.toHaveProperty("basis")
})

test("item 26 periods print only with 'yes', and a period shows only after the one before it", () => {
  const v = { ...SPECIMEN, prevVisas: "yes", prevVisa1From: "2024-02-01", prevVisa1To: "2024-02-10", prevVisa3From: "2025-01-01" }
  expect(printedText(v, Q("pl-guest-d"))).toMatchObject({ prevVisa1From: "01-02-2024", prevVisa1To: "10-02-2024" })
  expect(printedText(v, Q("pl-guest-d"))).not.toHaveProperty("prevVisa3From")
  expect(printedText({ ...v, prevVisas: "no" }, Q("pl-guest-d"))).not.toHaveProperty("prevVisa1From")
})

test("a cell joins its parts with a comma, or a new line in a multiline field, skipping empty ones", () => {
  expect(cellText("place+date", { place: "MINSK", date: "15-10-2026" }, false)).toBe("MINSK, 15-10-2026")
  expect(cellText("place+date", { place: "MINSK", date: "15-10-2026" }, true)).toBe("MINSK\n15-10-2026")
  expect(cellText("place+date", { date: "15-10-2026" }, false)).toBe("15-10-2026")
})

test("every Schengen state, status and city prints in Latin-1", () => {
  expect(Object.keys(COUNTRY_EN).sort()).toEqual(Object.keys(SCHENGEN).sort())
  for (const s of [...Object.values(COUNTRY_EN), ...Object.values(STATUS_EN), ...Object.values(CITIES).flat().map((c) => c.print)])
    expect(s).toMatch(/^[\x20-\x7E\xA0-\xFF]+$/)
})

test("the host prints as SURNAME FIRSTNAME, or the hotel name", () => {
  const host = { hostSurname: "Garcia Lopez", hostFirstName: "Ana", hotelName: "Hotel Ejemplo" }
  expect(printedText({ ...SPECIMEN, ...host, hostKind: "person" }, Q("pl-guest-d")).host).toBe("GARCIA LOPEZ ANA")
  expect(printedText({ ...SPECIMEN, ...host, hostKind: "hotel" }, Q("pl-guest-d")).host).toBe("HOTEL EJEMPLO")
})

test("the host and the organization print together, e-mails as typed", () => {
  const p = printedText({
    ...SPECIMEN, hostKind: "hotel", hotelName: "Hotel Ejemplo", hostAddress: "Calle Mayor 1, 28013 Madrid, Spain", hostEmail: "Reservas@Ejemplo.example",
    orgName: "Acme SL", orgAddress: "Calle Mayor 1, Madrid", orgContactSurname: "Perez", orgContactFirstName: "Juan",
    orgPhone: "+34 910 000 001", orgEmail: "Juan.Perez@acme.example",
  }, Q("pl-guest-d"))
  expect(p).toMatchObject({
    host: "HOTEL EJEMPLO", hostAddress: "CALLE MAYOR 1, 28013 MADRID, SPAIN", hostEmail: "Reservas@Ejemplo.example",
    org: "ACME SL, CALLE MAYOR 1, MADRID", orgContact: "PEREZ JUAN", orgEmail: "Juan.Perez@acme.example", orgPhone: "+34 910 000 001",
  })
})
