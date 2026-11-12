import type { Candidate, Rows } from "./mrz"

// mrz: this box read with the MRZ alphabet alone, from scripts/patch-ocr-worker.mjs. Absent on an unpatched SDK.
type Item = { poly: [number, number][]; text: string; mrz?: Candidate[] }

const load = () =>
  import("@paddleocr/paddleocr-js").then(({ PaddleOCR }) => {
    const models = new URL(`${import.meta.env.BASE_URL}models/`, location.href).href
    return PaddleOCR.create({
      textDetectionModelName: "PP-OCRv5_mobile_det",
      textDetectionModelAsset: { url: `${models}PP-OCRv5_mobile_det_onnx_infer.tar` },
      // English-only recogniser: ASCII dictionary with "<", no CJK look-alikes, half the size of the default one.
      textRecognitionModelName: "en_PP-OCRv5_mobile_rec",
      textRecognitionModelAsset: { url: `${models}en_PP-OCRv5_mobile_rec_onnx_infer.tar` },
      worker: true,
      // Self-hosted: without this the SDK falls back to fetching onnxruntime-web's wasm/mjs from
      // cdn.jsdelivr.net, a third-party dependency that also leaks the user's IP.
      ortOptions: { backend: "wasm", wasmPaths: new URL(`${import.meta.env.BASE_URL}ort/`, location.href).href },
    })
  })

let engine: ReturnType<typeof load> | null = null

function getEngine() {
  if (!engine) {
    engine = load()
    engine.catch(() => (engine = null)) // a failed download is retried with the next photo
  }
  return engine
}

export const preloadOcr = () => void getEngine().catch(() => {})

export async function recognize(image: Blob | ImageBitmap, onModelReady?: () => void): Promise<Rows> {
  const ocr = await getEngine()
  onModelReady?.()
  const photo = image instanceof Blob ? await createImageBitmap(image) : image
  // The page pass finds the MRZ and reads the printed words, which a smaller copy does as well and sooner
  // (the detector works at 960 px anyway). The MRZ itself is then cut from the full photo.
  const k = Math.max(photo.width, photo.height) / PAGE_SIDE
  const page =
    k > 1 ? await createImageBitmap(photo, { resizeWidth: Math.round(photo.width / k), resizeHeight: Math.round(photo.height / k), resizeQuality: "high" }) : photo
  try {
    const [{ items: found }] = await ocr.predict(page)
    const [kx, ky] = [photo.width / page.width, photo.height / page.height]
    const items = found.map((i: Item) => ({ ...i, poly: i.poly.map(([x, y]) => [x * kx, y * ky] as [number, number]) }))
    const band = mrzBand(items)
    if (!band) return groupRows(items)
    // The band's rows go first; the page rows still carry the printed issue date.
    const [zoom] = await ocr.predict(cut(photo, band))
    const read = readBand(zoom.items)
    return Object.assign([...read, ...groupRows(items)], { alts: read.alts })
  } finally {
    if (page !== photo) page.close()
    if (photo !== image) photo.close()
  }
}

// ponytail: 2400 px kept the printed words of every sample tried, a two-page spread included; lower it if photos allow.
const PAGE_SIDE = 2400

// x, y, w, h are in the frame turned along the MRZ, whose x axis is the unit vector (ux, uy).
type Band = { x: number; y: number; w: number; h: number; scale: number; ux: number; uy: number }

// MRZ boxes hold fillers, or a long unbroken run of capitals and digits (line 2 may have no fillers at all).
function looksMrz(text: string) {
  const s = text.replace(/\s/g, "")
  return /^[A-Z0-9<]+$/.test(s) && (s.includes("<") || s.length >= 25)
}

// Thin MRZ print on a small photo loses characters at page scale (a Belarusian sample kept 15 of the 44 in
// line 1), so the MRZ is read again on its own: its boxes plus a line of margin, for a line the detector missed.
export function mrzBand(items: Item[]): Band | null {
  const all = items.filter((i) => looksMrz(i.text))
  if (!all.length) return null
  // A box's short side is the line height, whichever way the photo is turned.
  const height = ({ poly: [a, b, c] }: Item) => Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]))
  // A printed line without spaces looks like a filler-less line 2, and one such box elsewhere on the page stretches
  // the band over all of it. Fillers are the mark of the MRZ: a box without them counts only next to one with them.
  const fillers = all.filter((i) => i.text.includes("<"))
  const [ux, uy] = textDirection(fillers.length ? fillers : all)
  const across = (i: Item) => i.poly.map(([px, py]) => py * ux - px * uy)
  const near = fillers.flatMap(across)
  const reach = 3 * Math.max(0, ...fillers.map(height))
  const mrz = fillers.length ? all.filter((i) => i.text.includes("<") || across(i).every((v) => v > Math.min(...near) - reach && v < Math.max(...near) + reach)) : all
  const boxes = mrz.map((i) => i.poly)
  const line = Math.max(...mrz.map(height))
  const us = boxes.flat().map(([px, py]) => px * ux + py * uy)
  const vs = mrz.flatMap(across)
  const x = Math.min(...us) - line
  // MRZ lines sit about two line heights apart: this margin must reach a line the detector missed.
  const y = Math.min(...vs) - 2.5 * line
  const w = Math.max(...us) + line - x
  const h = Math.max(...vs) + 2.5 * line - y
  // ponytail: 64 px lines read every sample tried (1× lost characters, 2–4× read all); 2000 px caps a page-sized band.
  return { x, y, w, h, scale: Math.min(64 / line, 2000 / Math.max(w, h)), ux, uy }
}

function cut(photo: ImageBitmap, { x, y, w, h, scale, ux, uy }: Band): ImageBitmap {
  const canvas = new OffscreenCanvas(Math.round(w * scale), Math.round(h * scale))
  const g = canvas.getContext("2d")
  if (!g) throw new Error("No 2D canvas context.")
  g.imageSmoothingQuality = "high"
  g.setTransform(ux * scale, -uy * scale, uy * scale, ux * scale, -x * scale, -y * scale)
  g.drawImage(photo, 0, 0)
  return canvas.transferToImageBitmap()
}

// PaddleOCR.js has no page-orientation model: it reads upside-down text as garbage, so the caller retries turned over.
export async function turnOver(image: Blob): Promise<ImageBitmap> {
  const src = await createImageBitmap(image)
  const canvas = new OffscreenCanvas(src.width, src.height)
  const g = canvas.getContext("2d")
  if (!g) throw new Error("No 2D canvas context.")
  g.rotate(Math.PI)
  g.drawImage(src, -src.width, -src.height)
  src.close()
  return canvas.transferToImageBitmap()
}

// Phone photos are rarely level, so rows run along the longest box (usually an MRZ line), not the image axes.
// Sideways text points down: PaddleOCR.js reads tall boxes top to bottom.
function textDirection(items: Item[]): [number, number] {
  let dir: [number, number] = [1, 0]
  let best = 0
  for (const { poly: [a, b, c] } of items)
    for (const [p, q] of [[a, b], [b, c]]) {
      const [dx, dy] = [q[0] - p[0], q[1] - p[1]]
      const len = Math.hypot(dx, dy)
      if (len <= best) continue
      best = len
      const flip = Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy < 0
      dir = flip ? [-dx / len, -dy / len] : [dx / len, dy / len]
    }
  return dir
}

// The MRZ band holds only MRZ print, so its boxes are taken with the MRZ alphabet.
export function readBand(items: Item[]): Rows {
  const rows = rowsOf(items.map((i) => (i.mrz ? { ...i, text: i.mrz.map((c) => c[0]).join("") } : i)))
  const alts = Object.fromEntries(rows.map((r) => [r.map((i) => i.text).join("").replace(/\s/g, ""), r.flatMap((i) => i.mrz ?? [])]))
  return Object.assign(rows.map(joinRow), { alts })
}

export const groupRows = (items: Item[]) => rowsOf(items).map(joinRow)

const joinRow = (row: Item[]) => row.map((i) => i.text).join(" ")

// The detector may split one MRZ line into several boxes: merge boxes whose centres align across the text direction.
function rowsOf(items: Item[]): Item[][] {
  const [ux, uy] = textDirection(items)
  const boxes = items
    .map((item) => {
      const { poly } = item
      const xs = poly.map(([x, y]) => x * ux + y * uy)
      const ys = poly.map(([x, y]) => y * ux - x * uy)
      const top = Math.min(...ys)
      const bottom = Math.max(...ys)
      return { item, x: Math.min(...xs), cy: (top + bottom) / 2, h: bottom - top }
    })
    .sort((a, b) => a.cy - b.cy)
  const rows: (typeof boxes)[] = []
  for (const b of boxes) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0].cy - b.cy) < row[0].h / 2) row.push(b)
    else rows.push([b])
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x).map((b) => b.item))
}
