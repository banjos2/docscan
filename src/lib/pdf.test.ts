import { readFileSync, writeFileSync } from "node:fs"
import { PDFArray, PDFDocument, type PDFPage } from "pdf-lib"
import { expect, test } from "vitest"
import { emptyValues, type Values } from "./anketa"
import { fillAnketa } from "./pdf"

const template = readFileSync(new URL("../../public/anketa-template.pdf", import.meta.url))

// Fictional person from the official German passport specimen.
const specimen: Values = {
  ...emptyValues(new Date("2026-09-28T12:00:00")),
  surname: "Mustermann",
  surnameAtBirth: "Gabler",
  firstName: "Erika",
  birthDate: "1964-08-12",
  placeOfBirth: "Berlin",
  countryOfBirth: "Germany",
  nationality: "Germany",
  nationalityAtBirth: "Germany",
  sex: "F",
  maritalStatus: "married",
  docNumber: "C01X00T47",
  issueDate: "2017-03-01",
  expiryDate: "2027-02-28",
  issuedBy: "Germany",
  address1: "Heidestrasse 17",
  address2: "51147 Koeln, Germany",
  email: "erika@example.com",
  phone: "+49 221 000000",
  profession: "Engineer",
  purpose: "tourism",
  destination: "Spain",
  firstEntry: "Spain",
  entries: "multiple",
  arrivalDate: "2026-11-02",
  departureDate: "2026-11-16",
  host: "Hotel Ejemplo",
  hostAddress1: "Calle Mayor 1, 28013",
  hostAddress2: "Madrid, Spain",
  hostPhone: "+34 910 000 000",
  payer: "sponsor",
  sponsorWho: "Mother",
  means: ["cash"],
  place: "Koeln",
}

// pdf-lib appends content streams to every page it draws on.
const streams = (p: PDFPage) => {
  const c = p.node.Contents()
  return c instanceof PDFArray ? c.size() : 1
}

test("fillAnketa draws on all four pages of the template", async () => {
  const bytes = await fillAnketa(template, specimen)
  const [tpl, out] = await Promise.all([PDFDocument.load(template), PDFDocument.load(bytes)])
  expect(out.getPageCount()).toBe(4)
  for (let i = 0; i < 4; i++) expect(streams(out.getPage(i))).toBeGreaterThan(streams(tpl.getPage(i)))
  if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes)
})

test("fillAnketa rejects text that Helvetica cannot encode", async () => {
  await expect(fillAnketa(template, { ...specimen, placeOfBirth: "Минск" })).rejects.toThrow()
})
