import { expect, test } from "vitest"
import { emptyValues } from "./anketa"
import { extract, findIssueDate, MrzNotFoundError } from "./mrz"
import { validate } from "./validate"

const TODAY = new Date("2026-09-28T12:00:00")
// Official German passport specimen (fictional person).
const L1 = "P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<"
const L2 = "C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4"

test("extract maps a clean TD3 MRZ to anketa fields", () => {
  const { values, sources } = extract(["REISEPASS PASSPORT", "MUSTERMANN", L1, L2], TODAY)
  expect(values).toMatchObject({
    surname: "MUSTERMANN",
    surnameAtBirth: "MUSTERMANN",
    firstName: "ERIKA",
    birthDate: "1964-08-12",
    sex: "F",
    nationality: "GERMANY",
    nationalityAtBirth: "GERMANY",
    countryOfBirth: "GERMANY",
    docType: "ordinary",
    docNumber: "C01X00T47",
    expiryDate: "2027-02-28",
    issuedBy: "GERMANY",
    nationalId: "",
  })
  expect(values.issueDate).toBe("")
  expect(sources).toMatchObject({ surname: "mrz", docNumber: "mrz", birthDate: "mrz", expiryDate: "mrz", surnameAtBirth: "check" })
})

test("extract blanks a birth date whose check digit fails and which is also impossible", () => {
  // "640872" is not a real date (day 87); the original "640812" check digit no longer matches it.
  const { values, sources } = extract(["REISEPASS PASSPORT", "MUSTERMANN", L1, L2.replace("6408125", "6408725")], TODAY)
  expect(values.birthDate).toBe("")
  expect(sources.birthDate).toBe("check")
})

test("extract repairs filler look-alikes and flags autocorrected fields", () => {
  // « stands for "<<", く for "<"; one filler is missing; "O" was read instead of "0".
  const { values, sources } = extract(["P<D<<MUSTERMANNくくERIKA«««««««««", "C01X00T478D<<64O8125F2702283 ««««««« 4"], TODAY)
  expect(values).toMatchObject({ surname: "MUSTERMANN", firstName: "ERIKA", birthDate: "1964-08-12", docNumber: "C01X00T47" })
  expect(sources.birthDate).toBe("check")
})

test("extract leaves sex blank for manual choice when the MRZ marks it unspecified", () => {
  // "<" in the sex position (instead of M/F) parses as mrz's "nonspecified", not male or female.
  const { values, sources } = extract(["REISEPASS PASSPORT", "MUSTERMANN", L1, L2.replace("F", "<")], TODAY)
  expect(values.sex).toBe("")
  expect(sources.sex).toBe("check")
})

test("extract picks up the issue date from the visual zone", () => {
  const { values, sources } = extract(["12.08.1964 BERLIN", "01.03.2017 28.02.2027", L1, L2], TODAY)
  expect(values.issueDate).toBe("2017-03-01")
  expect(sources.issueDate).toBe("check")
})

test("extract throws MrzNotFoundError without an MRZ", () => {
  expect(() => extract(["REISEPASS", "MUSTERMANN ERIKA", "12.08.1964"], TODAY)).toThrow(MrzNotFoundError)
})

test("findIssueDate returns the only date that is neither birth nor expiry", () => {
  expect(findIssueDate(["12.08.1964", "01 MÄR/MAR 2017", "28.02.2027"], "1964-08-12", "2027-02-28")).toBe("2017-03-01")
  expect(findIssueDate(["15 JUN 1990", "05 APR/APR 21", "05.04.2031"], "1990-06-15", "2031-04-05")).toBe("2021-04-05")
  expect(findIssueDate(["01.01.2010", "01.01.2011"], "1990-01-01", "2030-01-01")).toBe("")
})

test("validate requires key fields and Latin-1 text", () => {
  const { errors } = validate({ ...emptyValues(TODAY), placeOfBirth: "Минск" }, TODAY)
  expect(Object.keys(errors).sort()).toEqual(["birthDate", "docNumber", "expiryDate", "firstName", "nationality", "placeOfBirth", "surname"])
  expect(errors.placeOfBirth).toBe("Анкета заполняется латиницей")
  // Covering: DEL (0x7F) and C1 control (0x85) must be rejected
  expect(validate({ ...emptyValues(TODAY), address1: `Berlin${String.fromCharCode(0x7f)}` }, TODAY).errors.address1).toBe("Анкета заполняется латиницей")
  expect(validate({ ...emptyValues(TODAY), address1: `Berlin${String.fromCharCode(0x85)}` }, TODAY).errors.address1).toBe("Анкета заполняется латиницей")
})

test("validate skips the sponsor field when the payer is not the sponsor", () => {
  const { errors } = validate({ ...emptyValues(TODAY), payer: "self", sponsorWho: "Мать" }, TODAY)
  expect(errors.sponsorWho).toBeUndefined()
})

test("validate warns about passport validity", () => {
  const v = { ...emptyValues(TODAY), expiryDate: "2026-12-01", departureDate: "2026-11-16", issueDate: "2015-01-01", birthDate: "2030-01-01" }
  expect(validate(v, TODAY).warnings).toHaveLength(3)
  expect(validate({ ...v, expiryDate: "2026-01-01" }, TODAY).warnings).toHaveLength(4)
  expect(validate({ ...v, expiryDate: "2030-01-01", issueDate: "2020-01-01", birthDate: "1990-01-01" }, TODAY).warnings).toHaveLength(0)
})
