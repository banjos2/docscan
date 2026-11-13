import { expect, test } from "vitest"
import { emptyValues, maskDmy, parseDmy, showDmy } from "./anketa"
import { extract, findIssueDate, MrzNotFoundError } from "./mrz"
import { QUESTIONNAIRES } from "./questionnaire"
import { validate } from "./validate"

const TODAY = new Date("2026-09-28T12:00:00")
const Q = (id: string) => QUESTIONNAIRES.find((q) => q.id === id)!
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
  expect(sources).toMatchObject({ docNumber: "mrz", birthDate: "mrz", expiryDate: "mrz", surnameAtBirth: "check" })
})

test("extract never confirms a name: no check digit covers line 1", () => {
  const { sources } = extract([L1, L2], TODAY)
  expect(sources).toMatchObject({ surname: "check", firstName: "check" })
})

test("extract confirms a name only when the printed page repeats every word of it", () => {
  expect(extract(["MUSTERMANN", "ERIKA", L1, L2], TODAY).sources).toMatchObject({ surname: "mrz", firstName: "mrz" })
  expect(extract(["MUSTERMANN", "ANNA", L1, L2], TODAY).sources).toMatchObject({ surname: "mrz", firstName: "check" })
})

test("extract does not take a second reading of the MRZ for the printed page", () => {
  const { sources } = extract([L1, L2, "P D MUSTERMANN ERIKA KKKKKKKKKKKKKKKKKKKK"], TODAY)
  expect(sources).toMatchObject({ surname: "check", firstName: "check" })
})

const CLIPPED = "P<D<<MUSTERMAN<<ERIK".padEnd(44, "<")

test("extract prefers the reading of the name line that the printed page backs", () => {
  // Same letter count, so only the printed words can tell them apart.
  const other = "P<D<<MUSTERMANX<<ERIKA".padEnd(44, "<")
  expect(extract([other, L2, L1, L2, "MUSTERMANN", "ERIKA"], TODAY).values).toMatchObject({ surname: "MUSTERMANN", firstName: "ERIKA" })
})

test("extract prefers the fuller reading of the name line when nothing else decides", () => {
  expect(extract([CLIPPED, L2, L1, L2], TODAY).values).toMatchObject({ surname: "MUSTERMANN", firstName: "ERIKA" })
})

test("extract accepts a fuller name line even if that read lost many fillers", () => {
  expect(extract([CLIPPED, L2, "P<D<<MUSTERMANN<<ERIKA<<<<<<<<", L2], TODAY).values).toMatchObject({ surname: "MUSTERMANN", firstName: "ERIKA" })
})

test("extract reads a name line that lost many fillers when it is the only read of it", () => {
  // A photocopy: the page pass missed line 1 altogether and its zoomed read kept 9 of the 22 fillers.
  const { values, sources } = extract(["MUSTERMANN", "ERIKA", "P<D<<MUSTERMANN<<ERIKA<<<<<<<<<", L2], TODAY)
  expect(values).toMatchObject({ surname: "MUSTERMANN", firstName: "ERIKA", docNumber: "C01X00T47", issuedBy: "GERMANY" })
  // The printed page confirms the names; nothing confirms the rest of a line that had to be resized.
  expect(sources).toMatchObject({ surname: "mrz", firstName: "mrz", issuedBy: "check", docNumber: "mrz" })
})

test("extract does not take a filler misread as a letter for one more given name", () => {
  // The names end at their second "<<": the "S" five fillers later is a filler the OCR took for a letter.
  const stray = "P<D<<MUSTERMANN<<ERIKA<<<<<S".padEnd(44, "<")
  const { values, sources } = extract(["MUSTERMANN", "ERIKA", stray, L2], TODAY)
  expect(values).toMatchObject({ surname: "MUSTERMANN", firstName: "ERIKA" })
  expect(sources).toMatchObject({ surname: "mrz", firstName: "mrz" })
  // A second given name sits one filler away and stays.
  expect(extract(["P<D<<MUSTERMANN<<ERIKA<S".padEnd(44, "<"), L2], TODAY).values.firstName).toBe("ERIKA S")
})

test("extract pairs the best name line with the best line 2 from different reads", () => {
  // The first read has the whole name but a line 2 with a failed birth date; the second read the other way round.
  const brokenL2 = L2.replace("6408125", "6408135")
  const { values, sources } = extract([L1, brokenL2, CLIPPED, L2], TODAY)
  expect(values).toMatchObject({ surname: "MUSTERMANN", firstName: "ERIKA", birthDate: "1964-08-12" })
  expect(sources.birthDate).toBe("mrz")
})

test("extract takes line 2 from a read whose name line was too short to pair", () => {
  const { values, sources } = extract([L1, L2.replace("6408125", "6408135"), "P<D<<MUSTER", L2], TODAY)
  expect(values.birthDate).toBe("1964-08-12")
  expect(sources.birthDate).toBe("mrz")
})

test("extract asks to review a field without a check digit when its line had to be resized", () => {
  // One filler lost from line 2: the check digits still confirm their fields, nothing confirms these two.
  const short2 = extract([L1, L2.replace("<<<<<", "<<<<")], TODAY).sources
  expect(short2).toMatchObject({ nationality: "check", sex: "check", issuedBy: "mrz", docNumber: "mrz", birthDate: "mrz", expiryDate: "mrz" })
  // The same on line 1: line 2 stays confirmed.
  const short1 = extract([L1.replace("<<<<<", "<<<<"), L2], TODAY).sources
  expect(short1).toMatchObject({ issuedBy: "check", nationality: "mrz", sex: "mrz" })
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

// Real OCR rows from a Belarusian passport sample: the thin MRZ font lost most of line 1.
const BY_L2 = "KB12345671BLR8802026F08020191234567A123PB134"
const BY_ROWS = ["MATA BBULA I/DATE OF ISSUE ALKI BUA AIAPTAUTHORITY", "02 02 1988 1234567A123PB1", "02 02 1998 MINISTRY OF", "01 02 2008 INTERNAL AFFAIRS", "P<BLRJOHNSON<<E <<<<<<<<<", BY_L2]

test("extract never pairs a visual-zone line with MRZ line 2", () => {
  // Line 2 has every check digit right, but nothing checks line 1: a text line must not pass for it.
  expect(() => extract(BY_ROWS, TODAY)).toThrow(MrzNotFoundError)
  expect(() => extract(["PLACE OF BIRTH/LIEU DE NAISSANCE MOSCOW USSR", BY_L2], TODAY)).toThrow(MrzNotFoundError)
})

test("extract reads the MRZ re-read from its band ahead of the page rows", () => {
  const { values } = extract(["P<BLRJOHNSON<<EMILY<<<<<<<<<<<<<<<<<<<<<<<<<", BY_L2, ...BY_ROWS], TODAY)
  expect(values).toMatchObject({ surname: "JOHNSON", firstName: "EMILY", docNumber: "KB1234567", birthDate: "1988-02-02", issueDate: "1998-02-02" })
})

test("findIssueDate returns the only date that is neither birth nor expiry", () => {
  expect(findIssueDate(["12.08.1964", "01 MÄR/MAR 2017", "28.02.2027"], "1964-08-12", "2027-02-28")).toBe("2017-03-01")
  expect(findIssueDate(["15 JUN 1990", "05 APR/APR 21", "05.04.2031"], "1990-06-15", "2031-04-05")).toBe("2021-04-05")
  expect(findIssueDate(["01.01.2010", "01.01.2011"], "1990-01-01", "2030-01-01")).toBe("")
})

test("findIssueDate lets the label decide between several candidate dates", () => {
  expect(findIssueDate(["DATE OF ISSUE", "01.01.2010", "PRINTED 01.01.2011"], "1990-01-01", "2030-01-01")).toBe("2010-01-01")
  expect(findIssueDate(["PRINTED 01.01.2011", "DATE OF ISSUE", "01.01.2010"], "1990-01-01", "2030-01-01")).toBe("2010-01-01")
  // A label with no date after it decides nothing.
  expect(findIssueDate(["01.01.2010", "01.01.2011", "DATE OF ISSUE"], "1990-01-01", "2030-01-01")).toBe("")
})

test("findIssueDate ignores a misread date that isn't on the calendar", () => {
  expect(findIssueDate(["31.02.2019", "12.08.1964", "28.02.2027"], "1964-08-12", "2027-02-28")).toBe("")
  expect(findIssueDate(["31 FEB 2019", "15.03.2019"], "1964-08-12", "2027-02-28")).toBe("2019-03-15")
})

test("maskDmy adds the dots a numeric keypad lacks; parseDmy stores only real dates as ISO, the rest as typed", () => {
  expect(["1", "19", "190", "1907", "19072016", "19.07.2016", "19/07/20161"].map(maskDmy)).toEqual(["1", "19", "19.0", "19.07", "19.07.2016", "19.07.2016", "19.07.2016"])
  const typed = ["19.07.2016", "29.02.2024", "31.02.2020", "19.07.20", ""]
  expect(typed.map(parseDmy)).toEqual(["2016-07-19", "2024-02-29", "31.02.2020", "19.07.20", ""])
  // The field shows back exactly what was typed.
  expect(typed.map(parseDmy).map(showDmy)).toEqual(typed)
})

test("validate requires key fields and Latin-1 text", () => {
  const { errors } = validate({ ...emptyValues(), placeOfBirth: "Минск" }, Q("pl-guest-d"), TODAY)
  expect(Object.keys(errors).sort()).toEqual(["birthDate", "docNumber", "expiryDate", "firstName", "nationality", "placeOfBirth", "surname"])
  expect(errors.placeOfBirth).toBe("Анкета заполняется латиницей")
  // Covering: DEL (0x7F) and C1 control (0x85) must be rejected
  expect(validate({ ...emptyValues(), regStreet: `Berlin${String.fromCharCode(0x7f)}` }, Q("pl-guest-d"), TODAY).errors.regStreet).toBe("Анкета заполняется латиницей")
  expect(validate({ ...emptyValues(), regStreet: `Berlin${String.fromCharCode(0x85)}` }, Q("pl-guest-d"), TODAY).errors.regStreet).toBe("Анкета заполняется латиницей")
  // A tab pasted from a spreadsheet prints as a space.
  expect(validate({ ...emptyValues(), regStreet: "Polna\t7" }, Q("pl-guest-d"), TODAY).errors.regStreet).toBeUndefined()
})

test("validate skips the sponsor field when the payer is not the sponsor", () => {
  const { errors } = validate({ ...emptyValues(), payer: "self", sponsorWho: "Мать" }, Q("pl-guest-d"), TODAY)
  expect(errors.sponsorWho).toBeUndefined()
})

test("validate ignores a hidden field even in Cyrillic, and checks it once it shows", () => {
  expect(validate({ ...emptyValues(), employment: "pensioner", employerName: "Ромашка" }, Q("pl-guest-d"), TODAY).errors.employerName).toBeUndefined()
  expect(validate({ ...emptyValues(), employment: "employed", employerName: "Ромашка" }, Q("pl-guest-d"), TODAY).errors.employerName).toBe("Анкета заполняется латиницей")
})

test("validate warns about passport validity", () => {
  const v = { ...emptyValues(), expiryDate: "2026-12-01", departureDate: "2026-11-16", issueDate: "2015-01-01", birthDate: "2030-01-01" }
  expect(validate(v, Q("pl-guest-d"), TODAY).warnings).toHaveLength(3)
  expect(validate(v, Q("pl-guest-d"), TODAY).warnings).toContain("Паспорт должен действовать ещё минимум 3 месяца после выезда из Шенгена.")
  expect(validate({ ...v, expiryDate: "2026-01-01" }, Q("pl-guest-d"), TODAY).warnings).toHaveLength(4)
  expect(validate({ ...v, expiryDate: "2030-01-01", issueDate: "2020-01-01", birthDate: "1990-01-01" }, Q("pl-guest-d"), TODAY).warnings).toHaveLength(0)
})

test("validate flags a date left unfinished or impossible instead of letting the PDF go out without it", () => {
  const v = { ...emptyValues(), expiryDate: "31.02.2020", departureDate: "12.03.20", issueDate: "2015-01-01" }
  const { errors, warnings } = validate(v, Q("pl-guest-d"), TODAY)
  expect(errors.expiryDate).toBe("Проверьте дату: ДД.ММ.ГГГГ")
  expect(errors.departureDate).toBe("Проверьте дату: ДД.ММ.ГГГГ")
  expect(errors.issueDate).toBeUndefined()
  // Only real dates are compared: the issue date alone is old enough to warn about.
  expect(warnings).toEqual(["Паспорт выдан больше 10 лет назад: для шенгенской визы он не подойдёт."])
})

test("validate stops the PDF on an unfinished submission date", () => {
  expect(validate({ ...emptyValues(), submissionDate: "20.11.20" }, Q("pl-guest-d"), TODAY).errors.submissionDate).toBe("Проверьте дату: ДД.ММ.ГГГГ")
})

test("a choice the blank cannot tick is an error", () => {
  expect(validate({ ...emptyValues(), sex: "X" }, Q("pl-guest-d"), TODAY).errors.sex).toBe("Этого варианта нет в бланке")
})

test("a field the questionnaire lacks is neither checked nor printed", () => {
  expect(validate({ ...emptyValues(), basis: "Праца" }, Q("pl-guest-d"), TODAY).errors.basis).toBeUndefined()
  expect(validate({ ...emptyValues(), basis: "Праца" }, Q("pl-work"), TODAY).errors.basis).toBe("Анкета заполняется латиницей")
})

// The MRZ-alphabet reading of a line: for each character [best, its probability, runner-up, its probability].
const scanned = (l2: string, runnerUp: Record<number, [string, number]>) =>
  Object.assign([L1, l2], {
    alts: { [l2]: [...l2].map((c, i): [string, number, string, number] => [c, 0.9, runnerUp[i]?.[0] ?? "", runnerUp[i]?.[1] ?? 0]) },
  })
// "D" read for the "0" at index 1: the document number's check digit fails.
const MISREAD = L2.replace("C01", "CD1")

test("extract repairs a failed field when exactly one runner-up satisfies its check digit, and asks to review it", () => {
  const { values, sources } = extract(scanned(MISREAD, { 1: ["0", 0.3] }), TODAY)
  expect(values.docNumber).toBe("C01X00T47")
  expect(sources.docNumber).toBe("check")
})

test("extract refuses to choose when two runner-ups would both satisfy the check digit", () => {
  // "5" at index 0 shifts the weighted sum by the same amount as "0" at index 1.
  const { values, sources } = extract(scanned(MISREAD, { 0: ["5", 0.3], 1: ["0", 0.3] }), TODAY)
  expect(values.docNumber).toBe("CD1X00T47")
  expect(sources.docNumber).toBe("check")
})

test("extract ignores a runner-up the model barely considered", () => {
  // "X" is not one of the classic look-alikes, so only the runner-up could have repaired it.
  expect(extract(scanned(L2.replace("C01", "CX1"), { 1: ["0", 0.01] }), TODAY).values.docNumber).toBe("CX1X00T47")
})

test("extract does not confirm a field when a plausible runner-up passes the same check digit", () => {
  // "1" and "B" weigh the same modulo 10, so the check digit cannot tell which one is printed.
  const { values, sources } = extract(scanned(L2, { 2: ["B", 0.3] }), TODAY)
  expect(values.docNumber).toBe("C01X00T47")
  expect(sources.docNumber).toBe("check")
})

test("extract keeps a field confirmed when the runner-up fails the check digit", () => {
  expect(extract(scanned(L2, { 1: ["O", 0.3] }), TODAY).sources.docNumber).toBe("mrz")
})

test("extract repairs a date only with a digit", () => {
  const broken = L2.replace("6408125", "6408135")
  expect(extract(scanned(broken, { 18: ["2", 0.3] }), TODAY).values.birthDate).toBe("1964-08-12")
  // "C" has the value of a 2 modulo 10, but a date holds digits.
  expect(extract(scanned(broken, { 18: ["C", 0.3] }), TODAY).values.birthDate).toBe("1964-08-13")
})

test("extract still repairs a field when the line lost a filler", () => {
  const short = MISREAD.replace("<<<<<", "<<<<")
  expect(extract(scanned(short, { 1: ["0", 0.3] }), TODAY).values.docNumber).toBe("C01X00T47")
})

test("extract repairs a classic look-alike in a failed field even when the model was sure, and asks to review it", () => {
  const { values, sources } = extract([L1, L2.replace("C01", "CO1")], TODAY)
  expect(values.docNumber).toBe("C01X00T47")
  expect(sources.docNumber).toBe("check")
})

// A scan's "I" read as "Z" by the page pass and by the zoom, which also lost the first letter of the name.
const PAGE_L1 = "P<D<<MUSTERMANN<<ERZKA".padEnd(44, "<")
const ZOOM_L1 = "P<D<<MUSTERMANN<<RZKA".padEnd(43, "<")
const misreadName = (zoom: string, runnerUp: Record<number, [string, number]>, printed = ["MUSTERMANN", "ERIKA C"]) =>
  Object.assign([zoom, L2, PAGE_L1, L2, ...printed], {
    alts: { [zoom]: [...zoom].map((c, i): [string, number, string, number] => [c, 0.9, runnerUp[i]?.[0] ?? "", runnerUp[i]?.[1] ?? 0]) },
  })
const Z_AT = ZOOM_L1.indexOf("Z")

test("extract takes a name's letter from the printed page when the MRZ's runner-up agrees, and asks to review it", () => {
  const { values, sources } = extract(misreadName(ZOOM_L1, { [Z_AT]: ["I", 0.25] }), TODAY)
  expect(values.firstName).toBe("ERIKA")
  expect(sources.firstName).toBe("check")
  expect(sources.surname).toBe("mrz")
})

test("extract takes a name's letter from the printed page when another read of the MRZ has it", () => {
  expect(extract(misreadName(ZOOM_L1.replace("Z", "I"), {}), TODAY).values.firstName).toBe("ERIKA")
})

test("extract keeps the MRZ's name when no read of the MRZ backs the printed letter", () => {
  expect(extract(misreadName(ZOOM_L1, {}), TODAY).values.firstName).toBe("ERZKA")
  expect(extract(misreadName(ZOOM_L1, { [Z_AT]: ["I", 0.01] }), TODAY).values.firstName).toBe("ERZKA")
  expect(extract(misreadName(ZOOM_L1, { [Z_AT]: ["T", 0.25] }), TODAY).values.firstName).toBe("ERZKA")
})

test("extract keeps the MRZ's name when two printed words are one letter away", () => {
  expect(extract(misreadName(ZOOM_L1, { [Z_AT]: ["I", 0.25] }, ["MUSTERMANN", "ERIKA", "ERZKO"]), TODAY).values.firstName).toBe("ERZKA")
})

test("extract takes the printed name when every read of the MRZ lost a letter of it", () => {
  const rows = misreadName(ZOOM_L1, { [Z_AT]: ["I", 0.25] }).with(2, ZOOM_L1)
  expect(extract(Object.assign(rows, { alts: misreadName(ZOOM_L1, { [Z_AT]: ["I", 0.25] }).alts }), TODAY)).toMatchObject({
    values: { firstName: "ERIKA" },
    sources: { firstName: "check" },
  })
  // A dropped letter alone, with nothing misread.
  expect(extract(["MUSTERMANN", "ERIKA", CLIPPED, L2], TODAY).values).toMatchObject({ surname: "MUSTERMANN", firstName: "ERIKA" })
})

test("extract does not take one of the person's names for a misread of another", () => {
  const ivan = "P<D<<IVANOV<<IVAN".padEnd(44, "<")
  expect(extract(["IVANOV", ivan, L2], TODAY).values).toMatchObject({ surname: "IVANOV", firstName: "IVAN" })
  // Nor a longer printed word that would need a letter the MRZ never had removed.
  expect(extract(["MUSTERMANN", "ERIK", L1, L2], TODAY).values.firstName).toBe("ERIKA")
})

test("findIssueDate reads a date whose digits the OCR ran together", () => {
  const rows = ["28041960 1234567A123PB1", "DATE OF ISSUE AUTHORITY", "07 082026 MINISTRY OF", "28.04.2060", "KB12345671BLR6004284F6004284"]
  expect(findIssueDate(rows, "1960-04-28", "2060-04-28")).toBe("2026-08-07")
})
