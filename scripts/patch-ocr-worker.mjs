// PaddleOCR.js returns only the best text of a line. The MRZ decoder also needs that line read with the MRZ alphabet
// alone, with each character's runner-up, so the SDK's worker gets a second CTC decode. Pinned to paddleocr-js 0.4.2:
// run from scripts/fetch_assets.sh, and it stops the build if the worker no longer looks as expected.
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const dir = join(import.meta.dirname, "../node_modules/@paddleocr/paddleocr-js/dist/assets")
const file = join(dir, readdirSync(dir).find((f) => /^worker-entry-.*\.js$/.test(f)))
let source = readFileSync(file, "utf8")

const decoder = `const MRZ_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";
function decodeMrz(data, offset, timeSteps, classes, charDict) {
  const allowed = [];
  for (let cls = 1; cls < classes && cls <= charDict.length; cls += 1) {
    if (charDict[cls - 1] && MRZ_ALPHABET.includes(charDict[cls - 1])) allowed.push(cls);
  }
  const read = [];
  let prev = -1;
  for (let step = 0; step < timeSteps; step += 1) {
    const at = offset + step * classes;
    let first = -1, firstP = -Infinity, second = -1, secondP = -Infinity;
    for (const cls of allowed) {
      const p = data[at + cls];
      if (p > firstP) { second = first; secondP = firstP; first = cls; firstP = p; }
      else if (p > secondP) { second = cls; secondP = p; }
    }
    const cls = firstP > data[at] ? first : 0;
    if (cls > 0) {
      const entry = [charDict[first - 1], firstP, second > 0 ? charDict[second - 1] : "", second > 0 ? secondP : 0];
      if (cls !== prev) read.push(entry);
      else if (firstP > read[read.length - 1][1]) read[read.length - 1] = entry;
    }
    prev = cls;
  }
  return read;
}
function decodeCTCSample(data, offset, timeSteps, classes, charDict) {`

const edits = [
  ["function decodeCTCSample(data, offset, timeSteps, classes, charDict) {", decoder],
  ["  return { text, score };\n}\nfunction postprocess(", "  return { text, score, mrz: decodeMrz(data, offset, timeSteps, classes, charDict) };\n}\nfunction postprocess("],
  ["return decoded.map(({ text, score }) => ({ text, score }));", "return decoded.map(({ text, score, mrz }) => ({ text, score, mrz }));"],
  ["                  text: rec.text,\n                  score: rec.score\n", "                  text: rec.text,\n                  score: rec.score,\n                  mrz: rec.mrz\n"],
]

if (source.includes("function decodeMrz(")) {
  console.log("skip (patched): OCR worker")
} else {
  for (const [from, to] of edits) {
    if (source.split(from).length !== 2) throw new Error(`OCR worker changed, cannot patch: ${from}`)
    source = source.replace(from, () => to)
  }
  writeFileSync(file, source)
  console.log("patched: OCR worker")
}
