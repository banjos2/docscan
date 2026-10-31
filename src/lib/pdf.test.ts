import { readFileSync, writeFileSync } from "node:fs"
import { PDFArray, PDFDocument, type PDFPage } from "pdf-lib"
import { expect, test } from "vitest"
import { fillAnketa } from "./pdf"
import { SPECIMEN } from "./specimen"
import { ES } from "./templates/es"

const template = readFileSync(new URL("../../public/anketa-template.pdf", import.meta.url))

// pdf-lib appends content streams to every page it draws on.
const streams = (p: PDFPage) => {
  const c = p.node.Contents()
  return c instanceof PDFArray ? c.size() : 1
}

test("fillAnketa draws on all four pages of the template", async () => {
  const bytes = await fillAnketa(template, SPECIMEN, ES)
  const [tpl, out] = await Promise.all([PDFDocument.load(template), PDFDocument.load(bytes)])
  expect(out.getPageCount()).toBe(4)
  for (let i = 0; i < 4; i++) expect(streams(out.getPage(i))).toBeGreaterThan(streams(tpl.getPage(i)))
  if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes)
})

test("fillAnketa rejects text that Helvetica cannot encode", async () => {
  await expect(fillAnketa(template, { ...SPECIMEN, placeOfBirth: "Минск" }, ES)).rejects.toThrow()
})
