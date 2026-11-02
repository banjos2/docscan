// Turns a filled PDF form into a blank: empty fields, no document metadata, no objects left over from earlier edits.
// node scripts/blanks/clean-pdf.mjs <in.pdf> <out.pdf>
import { readFileSync, writeFileSync } from "node:fs"
import { PDFArray, PDFButton, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRadioGroup, PDFRef, PDFStream, PDFTextField } from "pdf-lib"

const [src, dst] = process.argv.slice(2)
if (!src || !dst) throw new Error("usage: node scripts/blanks/clean-pdf.mjs <in.pdf> <out.pdf>")

const doc = await PDFDocument.load(readFileSync(src), { updateMetadata: false, ignoreEncryption: true })
const { context, catalog } = doc
if (context.trailerInfo.Encrypt) throw new Error(`${src} is encrypted; remove the password first`)

const form = doc.getForm()
for (const f of form.getFields()) {
  if (f instanceof PDFTextField) {
    f.setText(undefined)
    f.acroField.dict.delete(PDFName.of("RV"))
    // The appearance holds the typed text. No new one is drawn: pdf-lib would write its auto-size into the DA.
    for (const w of f.acroField.getWidgets()) w.dict.delete(PDFName.of("AP"))
  } else if (f instanceof PDFCheckBox || f instanceof PDFRadioGroup) {
    f.acroField.setValue(PDFName.of("Off")) // /V and /AS of every widget
  } else if (!(f instanceof PDFButton)) {
    // A dropdown, list or signature would keep the client's choice or signature: teach this script to clear it first.
    throw new Error(`${src}: ${f.getName()}: ${f.constructor.name} is not cleaned`)
  }
}

for (const k of ["XFA", "NeedsRendering"]) form.acroForm.dict.delete(PDFName.of(k))
for (const k of ["NeedsRendering", "Metadata", "PieceInfo"]) catalog.delete(PDFName.of(k)) // PieceInfo: the editor's save stamp
context.trailerInfo.Info = undefined

// A reviewer's markup (strike-out, comment popup) is not part of the form: keep widgets and links only.
for (const page of doc.getPages()) {
  const annots = page.node.Annots()
  for (let i = (annots?.size() ?? 0) - 1; i >= 0; i--) {
    const subtype = annots.lookup(i, PDFDict).get(PDFName.of("Subtype")).toString()
    if (subtype !== "/Widget" && subtype !== "/Link") annots.remove(i)
  }
}

// The old appearances, replaced strings, earlier revisions: drop every object the catalog cannot reach.
const reachable = new Set()
const walk = (o) => {
  if (o instanceof PDFRef) {
    if (reachable.has(o.tag)) return
    reachable.add(o.tag)
    walk(context.lookup(o))
  } else if (o instanceof PDFDict) o.values().forEach(walk)
  else if (o instanceof PDFArray) o.asArray().forEach(walk)
  else if (o instanceof PDFStream) walk(o.dict)
}
walk(context.trailerInfo.Root)
for (const [ref] of context.enumerateIndirectObjects()) if (!reachable.has(ref.tag)) context.delete(ref)

// updateFieldAppearances: false, or pdf-lib redraws every widget left without an appearance and rewrites its DA
writeFileSync(dst, await doc.save({ updateFieldAppearances: false }))
console.log(`${form.getFields().length} fields`)
