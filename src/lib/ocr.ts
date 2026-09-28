type Item = { poly: [number, number][]; text: string }

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

export async function recognize(image: Blob | ImageBitmap, onModelReady?: () => void): Promise<string[]> {
  const ocr = await getEngine()
  onModelReady?.()
  const photo = image instanceof Blob ? await createImageBitmap(image) : image
  try {
    const [page] = await ocr.predict(photo)
    const band = mrzBand(page.items, photo.width, photo.height)
    if (!band) return groupRows(page.items)
    // The band's rows go first; the page rows still carry the printed issue date.
    const [zoom] = await ocr.predict(cut(photo, band))
    return [...groupRows(zoom.items), ...groupRows(page.items)]
  } finally {
    if (photo !== image) photo.close()
  }
}

type Band = { x: number; y: number; w: number; h: number; scale: number }

// MRZ boxes hold fillers, or a long unbroken run of capitals and digits (line 2 may have no fillers at all).
function looksMrz(text: string) {
  const s = text.replace(/\s/g, "")
  return /^[A-Z0-9<]+$/.test(s) && (s.includes("<") || s.length >= 25)
}

// Thin MRZ print on a small photo loses characters at page scale (a Belarusian sample kept 15 of the 44 in
// line 1), so the MRZ is read again on its own: its boxes plus a line of margin, for a line the detector missed.
export function mrzBand(items: Item[], width: number, height: number): Band | null {
  const boxes = items.filter((i) => looksMrz(i.text)).map((i) => i.poly)
  if (!boxes.length) return null
  // A box's short side is the line height, whichever way the photo is turned.
  const line = Math.max(...boxes.map(([a, b, c]) => Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]))))
  const xs = boxes.flat().map((p) => p[0])
  const ys = boxes.flat().map((p) => p[1])
  const x = Math.max(0, Math.min(...xs) - line)
  const y = Math.max(0, Math.min(...ys) - line)
  const w = Math.min(width, Math.max(...xs) + line) - x
  const h = Math.min(height, Math.max(...ys) + line) - y
  // ponytail: 64 px lines read every sample tried (1× lost characters, 2–4× read all); 2000 px caps a page-sized band.
  return { x, y, w, h, scale: Math.min(64 / line, 2000 / Math.max(w, h)) }
}

function cut(photo: ImageBitmap, { x, y, w, h, scale }: Band): ImageBitmap {
  const canvas = new OffscreenCanvas(Math.round(w * scale), Math.round(h * scale))
  const g = canvas.getContext("2d")
  if (!g) throw new Error("No 2D canvas context.")
  g.imageSmoothingQuality = "high"
  g.drawImage(photo, x, y, w, h, 0, 0, canvas.width, canvas.height)
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

// The detector may split one MRZ line into several boxes: merge boxes whose centres align across the text direction.
export function groupRows(items: Item[]): string[] {
  const [ux, uy] = textDirection(items)
  const boxes = items
    .map(({ poly, text }) => {
      const xs = poly.map(([x, y]) => x * ux + y * uy)
      const ys = poly.map(([x, y]) => y * ux - x * uy)
      const top = Math.min(...ys)
      const bottom = Math.max(...ys)
      return { text, x: Math.min(...xs), cy: (top + bottom) / 2, h: bottom - top }
    })
    .sort((a, b) => a.cy - b.cy)
  const rows: (typeof boxes)[] = []
  for (const b of boxes) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0].cy - b.cy) < row[0].h / 2) row.push(b)
    else rows.push([b])
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x).map((b) => b.text).join(" "))
}
