// A PDF form from a clean Word blank with markers: LibreOffice draws the blank, a field goes where each marker was.
// node scripts/blanks/make-form.mjs <clean.docx> <out.pdf> <fields.ts>
// Needs python3 and LibreOffice (soffice on PATH, or SOFFICE=/path/to/soffice).
// {{cell:WxH}}: a text field W × H pt, its top left corner at the marker, at ¾ of its line's font size above the
// baseline (where the line's capitals end); multiline from 26 pt high. {{tick}} right after a box ☐ □: a checkbox on it.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib"
import { findText } from "./find-text.js"

const [src, out, fieldsTs] = process.argv.slice(2)
if (!src || !out || !fieldsTs) throw new Error("usage: node scripts/blanks/make-form.mjs <clean.docx> <out.pdf> <fields.ts>")
const fail = (msg) => {
  throw new Error(`${src}: ${msg}`)
}
const sameLine = (p, q) => p.page === q.page && Math.abs(p.y - q.y) < 1

const tmp = mkdtempSync(join(tmpdir(), "make-form-"))
try {
  // A: markers in tiny type, so their places can be read; B: the same pages with the markers' text gone.
  const [a, b] = [join(tmp, "a.docx"), join(tmp, "b.docx")]
  const docx = fileURLToPath(new URL("docx.py", import.meta.url))
  const said = execFileSync("python3", ["-I", docx, "passes", src, a, b], { encoding: "utf8" })
  const word = Number(/^word pages (\d+)$/m.exec(said)?.[1])
  const written = JSON.parse(/^markers (.*)$/m.exec(said)?.[1] ?? "null")
  if (!word || !written) fail(`docx.py passes said: ${said}`)
  // A profile of its own: a LibreOffice already open would otherwise take the job over.
  const profile = `-env:UserInstallation=${pathToFileURL(join(tmp, "profile"))}`
  execFileSync(process.env.SOFFICE ?? "soffice", [profile, "--headless", "--convert-to", "pdf", "--outdir", tmp, a, b], { stdio: "ignore" })
  const bBytes = readFileSync(join(tmp, "b.pdf"))
  const [A, B] = [await findText(readFileSync(join(tmp, "a.pdf"))), await findText(bBytes)]

  // In A a marker pushes what follows it on its line by its own width; B has no such push.
  const push = (m) => A.markers.filter((o) => sameLine(o, m) && o.x < m.x).reduce((s, o) => s + o.w, 0)

  // The same pages in Word, A and B, and every box where it was: else the markers moved the layout.
  if (A.pages !== B.pages || word !== A.pages) fail(`pages: Word ${word}, A ${A.pages}, B ${B.pages}`)
  if (B.markers.length) fail(`pass B still shows {{${B.markers[0].text}}}`)
  for (let p = 0; p < A.pages; p++) {
    const [pa, pb] = [A.boxes.filter((x) => x.page === p), B.boxes.filter((x) => x.page === p)]
    if (pa.length !== pb.length) fail(`page ${p + 1}: ${pa.length} boxes with markers, ${pb.length} without`)
    // Up or down the page nothing moves; to the right a box moves only by the widths of the markers before it.
    pa.forEach((x, k) => {
      const [dx, dy] = [x.x - pb[k].x, x.y - pb[k].y]
      if (Math.abs(dy) > 1 || dx < -1 || dx > push(x) + 1) fail(`page ${p + 1}: box ${k + 1} moves ${dx.toFixed(1)}, ${dy.toFixed(1)} pt`)
    })
  }
  // Every marker written is on A's pages and nothing else is: a marker the text reader missed would lose its field.
  const left = A.markers.map((m) => m.text)
  for (const w of written) {
    if (!left.includes(w)) fail(`{{${w}}} is in the blank but not found on A's pages`)
    left.splice(left.indexOf(w), 1)
  }
  if (left.length) fail(`{{${left[0]}}} found on A's pages is not a marker of the blank`)
  const names = A.markers.map((m) => m.text.split(":")[0])
  const twice = names.find((n, i) => names.indexOf(n) !== i)
  if (twice) fail(`{{${twice}}} twice`)

  const text = [], boxes = []
  for (const m of A.markers) {
    const cell = /^([^:]+):(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(m.text)
    if (cell) {
      const [, name, w, h] = cell
      const top = m.y + 0.75 * m.size
      text.push({ name, page: m.page, x: m.x - push(m), y: top - Number(h), width: Number(w), height: Number(h) })
    } else if (/^[^:\s]+$/.test(m.text)) {
      // Its box: the nearest one to its left on its line, not more than a box's width away.
      const k = A.boxes.reduce((best, x, i) => (sameLine(x, m) && x.x < m.x && (best < 0 || x.x > A.boxes[best].x) ? i : best), -1)
      if (k < 0 || m.x - (A.boxes[k].x + A.boxes[k].w) > A.boxes[k].w) fail(`{{${m.text}}} has no box right before it`)
      const other = boxes.find((x) => x.k === k)
      if (other) fail(`{{${m.text}}} and {{${other.name}}} on one box`)
      const { page, x, y, w, h } = B.boxes[k]
      boxes.push({ name: m.text, k, page, x, y, width: w, height: h })
    } else fail(`{{${m.text}}}: a text marker is {{cell:WxH}}, a tick marker has no colon`)
  }

  const doc = await PDFDocument.load(bBytes, { updateMetadata: false })
  const pages = doc.getPages()
  const form = doc.getForm()
  // Helvetica as /Helv in the form's resources: the DA names it, and a viewer drawing a field looks it up there.
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  form.acroForm.dict.set(PDFName.of("DR"), doc.context.obj({ Font: { Helv: helv.ref } }))
  const bare = { borderWidth: 0, borderColor: undefined, backgroundColor: undefined }
  for (const t of text) {
    const f = form.createTextField(t.name)
    if (t.height >= 26) f.enableMultiline()
    f.addToPage(pages[t.page], { x: t.x, y: t.y, width: t.width, height: t.height, font: helv, ...bare })
    // Automatic size (setFontSize(0) is refused); no appearance yet, the filler draws one with the text.
    f.acroField.setDefaultAppearance("/Helv 0 Tf 0 g")
    for (const w of f.acroField.getWidgets()) {
      w.dict.delete(PDFName.of("DA"))
      w.dict.delete(PDFName.of("AP"))
    }
  }
  for (const x of boxes) form.createCheckBox(x.name).addToPage(pages[x.page], { x: x.x, y: x.y, width: x.width, height: x.height, ...bare })
  // LibreOffice's document info and XMP go, with every object nothing points at any more.
  writeFileSync(join(tmp, "form.pdf"), await doc.save({ updateFieldAppearances: false }))
  execFileSync(process.execPath, [fileURLToPath(new URL("clean-pdf.mjs", import.meta.url)), join(tmp, "form.pdf"), out], { stdio: "ignore" })

  const list = (xs) => xs.map((x) => `    ${JSON.stringify(x.name)},`).join("\n")
  writeFileSync(
    fieldsTs,
    `// Generated by scripts/blanks/make-form.mjs from ${relative(process.cwd(), resolve(src))}. Do not edit.\n` +
      `export default {\n  text: [\n${list(text)}\n  ],\n  boxes: [\n${list(boxes)}\n  ],\n} as const\n`,
  )
  console.log(`${A.pages} pages, ${text.length} text fields, ${boxes.length} checkboxes`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
