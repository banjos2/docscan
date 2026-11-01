// Where the markers {{…}} and the box glyphs ☐ □ sit on a PDF's pages, read from the pages' content streams.
// node scripts/blanks/find-text.js <file.pdf>
// → { pages, markers: [{ page, text, x, y, w, size }], boxes: [{ page, x, y, w, h }] }, in the order the page draws them;
// PDF points, x y = the first glyph's origin on its baseline, w = to the end of the last glyph's advance,
// size = the largest font size on the marker's line.
// Not PDFKit: its page.string puts a line's box glyphs after the line's text (LibreOffice draws them last, in a fallback
// font) and its character bounds then drift off their characters.
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib"

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
]
const ID = [1, 0, 0, 1, 0, 0]
const hex = (s) => Buffer.from(s.replace(/\s/g, "").padEnd(Math.ceil(s.replace(/\s/g, "").length / 2) * 2, "0"), "hex")
const bytesOf = (o) => (o instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(o).decode()) : Buffer.alloc(0))

// A ToUnicode CMap's bfchar and bfrange entries: character code → text.
function toUnicode(cmap) {
  const map = new Map(), s = cmap.toString("latin1"), u16 = (h) => hex(h).swap16().toString("utf16le")
  for (const [, body] of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, src, dst] of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(src, 16), u16(dst))
  for (const [, body] of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, lo, hi, dst] of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const list = [...dst.matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => m[1])
      const base = u16(list[0] ?? "")
      for (let c = parseInt(lo, 16), i = 0; c <= parseInt(hi, 16); c++, i++)
        map.set(c, dst.startsWith("[") ? u16(list[i] ?? "") : base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + i))
    }
  return map
}

// A font as the text operators need it: code width, how many bytes a code takes, its text.
function fontOf(dict) {
  const get = (d, k) => d.lookup(PDFName.of(k))
  const uni = toUnicode(bytesOf(get(dict, "ToUnicode")))
  const type0 = get(dict, "Subtype") === PDFName.of("Type0")
  const widths = new Map()
  let dflt = 0
  if (type0) {
    const cid = get(dict, "DescendantFonts").lookup(0, PDFDict)
    dflt = get(cid, "DW")?.asNumber() ?? 1000
    const w = get(cid, "W")?.asArray().map((o) => cid.context.lookup(o)) ?? []
    for (let i = 0; i < w.length; ) {
      const first = w[i].asNumber()
      if (w[i + 1] instanceof PDFArray) {
        w[i + 1].asArray().forEach((n, k) => widths.set(first + k, cid.context.lookup(n).asNumber()))
        i += 2
      } else {
        for (let c = first; c <= w[i + 1].asNumber(); c++) widths.set(c, w[i + 2].asNumber())
        i += 3
      }
    }
  } else {
    const first = get(dict, "FirstChar")?.asNumber() ?? 0
    get(dict, "Widths")?.asArray().forEach((n, k) => widths.set(first + k, dict.context.lookup(n).asNumber()))
  }
  return { bytes: type0 ? 2 : 1, width: (c) => widths.get(c) ?? dflt, text: (c) => uni.get(c) ?? "" }
}

// The tokens of a content stream: numbers, names, strings (as bytes), arrays, operators.
function* tokens(s) {
  const re = /\s*(?:%[^\r\n]*|(\[)|(\])|<<|>>|\/([^\s/<>[\](){}%]*)|<([0-9a-fA-F\s]*)>|(\()|([+-]?(?:\d+\.?\d*|\.\d+))|([^\s/<>[\](){}%]+))/y
  while (re.lastIndex < s.length) {
    const m = re.exec(s)
    if (!m) return
    if (m[1]) yield { array: "start" }
    else if (m[2]) yield { array: "end" }
    else if (m[3] !== undefined) yield { name: m[3] }
    else if (m[4] !== undefined) yield { str: hex(m[4]) }
    else if (m[5]) {
      // A literal string: balanced parentheses, backslash escapes.
      let i = re.lastIndex, depth = 1
      const out = []
      for (; depth; i++) {
        const c = s[i]
        if (c === "\\") {
          const n = s[++i]
          const esc = { n: 10, r: 13, t: 9, b: 8, f: 12 }[n]
          if (esc !== undefined) out.push(esc)
          else if (/[0-7]/.test(n)) {
            const oct = /^[0-7]{1,3}/.exec(s.slice(i))[0]
            out.push(parseInt(oct, 8) & 255)
            i += oct.length - 1
          } else if (n !== "\n" && n !== "\r") out.push(n.charCodeAt(0))
        } else if (c === "(" && ++depth) out.push(40)
        else if (c === ")" && --depth) out.push(41)
        else if (depth) out.push(c.charCodeAt(0))
      }
      re.lastIndex = i
      yield { str: Buffer.from(out) }
    } else if (m[6]) yield { num: Number(m[6]) }
    else if (m[7]) {
      yield { op: m[7] }
      if (m[7] === "ID") re.lastIndex = s.indexOf("EI", re.lastIndex) + 2 // inline image data
    }
  }
}

// Every glyph a page draws, in drawing order: its text, origin and advance in page space.
function glyphs(content, resources, ctm0, out) {
  const fonts = new Map()
  const font = (name) => {
    if (!fonts.has(name)) fonts.set(name, fontOf(resources.lookup(PDFName.of("Font"), PDFDict).lookup(PDFName.of(name), PDFDict)))
    return fonts.get(name)
  }
  const stack = []
  let gs = { ctm: ctm0, font: null, size: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0 }
  let tm = ID, tlm = ID, ops = []
  const array = []
  const show = (bytes) => {
    const f = gs.font
    for (let i = 0; i + f.bytes <= bytes.length; i += f.bytes) {
      const code = f.bytes === 2 ? bytes.readUInt16BE(i) : bytes[i]
      const trm = mul([gs.size * gs.th, 0, 0, gs.size, 0, gs.rise], mul(tm, gs.ctm))
      const tx = ((f.width(code) / 1000) * gs.size + gs.tc + (f.bytes === 1 && code === 32 ? gs.tw : 0)) * gs.th
      const end = mul([1, 0, 0, 1, tx, 0], mul(tm, gs.ctm))
      out.push({ ch: f.text(code), x: trm[4], y: trm[5], w: end[4] - trm[4], size: Math.abs(trm[3]) })
      tm = mul([1, 0, 0, 1, tx, 0], tm)
    }
  }
  const td = (x, y) => (tm = tlm = mul([1, 0, 0, 1, x, y], tlm))
  for (const t of tokens(content.toString("latin1"))) {
    if (t.array === "start") array.push([])
    else if (t.array === "end") {
      const a = array.pop()
      ;(array.at(-1) ?? ops).push(a)
    } else if (!t.op) (array.at(-1) ?? ops).push(t.num ?? t.str ?? t.name)
    else {
      const o = ops
      ops = []
      switch (t.op) {
        case "q": stack.push({ ...gs }); break
        case "Q": gs = stack.pop() ?? gs; break
        case "cm": gs.ctm = mul(o, gs.ctm); break
        case "BT": tm = tlm = ID; break
        case "Tf": gs.font = font(o[0]); gs.size = o[1]; break
        case "Tc": gs.tc = o[0]; break
        case "Tw": gs.tw = o[0]; break
        case "Tz": gs.th = o[0] / 100; break
        case "TL": gs.tl = o[0]; break
        case "Ts": gs.rise = o[0]; break
        case "Td": td(o[0], o[1]); break
        case "TD": gs.tl = -o[1]; td(o[0], o[1]); break
        case "Tm": tm = tlm = o; break
        case "T*": td(0, -gs.tl); break
        case "Tj": show(o[0]); break
        case "'": td(0, -gs.tl); show(o[0]); break
        case '"': gs.tw = o[0]; gs.tc = o[1]; td(0, -gs.tl); show(o[2]); break
        case "TJ":
          for (const e of o[0]) {
            if (typeof e === "number") tm = mul([1, 0, 0, 1, (-e / 1000) * gs.size * gs.th, 0], tm)
            else show(e)
          }
          break
        case "Do": {
          const x = resources.lookupMaybe(PDFName.of("XObject"), PDFDict)?.lookup(PDFName.of(o[0]))
          if (x instanceof PDFRawStream && x.dict.get(PDFName.of("Subtype")) === PDFName.of("Form")) {
            const m = x.dict.lookup(PDFName.of("Matrix"))?.asArray().map((n) => n.asNumber()) ?? ID
            glyphs(bytesOf(x), x.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources, mul(m, gs.ctm), out)
          }
          break
        }
      }
    }
  }
  return out
}

export async function findText(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const out = { pages: doc.getPageCount(), markers: [], boxes: [] }
  doc.getPages().forEach((p, page) => {
    const contents = p.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => p.doc.context.lookup(r)) : [contents]
    const g = glyphs(Buffer.concat(streams.map(bytesOf)), p.node.Resources(), ID, [])
    const text = g.map((x) => x.ch).join("")
    // A glyph's place in the joined text: a glyph may map to several characters (a ligature) or to none.
    const at = []
    g.forEach((x, i) => [...x.ch].forEach(() => at.push(i)))
    for (const m of text.matchAll(/\{\{[^{}]+\}\}/g)) {
      const first = g[at[m.index]], last = g[at[m.index + m[0].length - 1]]
      // The line's font size: its largest glyph on the marker's baseline, the marker's own included.
      const size = Math.max(...g.filter((x) => x.ch.trim() && Math.abs(x.y - first.y) < 1).map((x) => x.size))
      out.markers.push({ page, text: m[0].slice(2, -2), x: first.x, y: first.y, w: last.x + last.w - first.x, size })
    }
    // The box's frame: its advance wide and as tall, standing on the baseline.
    // ponytail: the glyph's real outline is in the embedded font; read its glyf box if a blank's squares sit lower.
    for (const x of g) if (x.ch === "☐" || x.ch === "□") out.boxes.push({ page, x: x.x, y: x.y, w: x.w, h: x.w })
  })
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error("usage: node scripts/blanks/find-text.js <file.pdf>")
  console.log(JSON.stringify(await findText(readFileSync(process.argv[2]))))
}
