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

export async function recognize(image: Blob, onModelReady?: () => void): Promise<string[]> {
  const ocr = await getEngine()
  onModelReady?.()
  const [result] = await ocr.predict(image)
  return groupRows(result.items)
}

// The detector may split one MRZ line into several boxes: merge boxes whose vertical centres align.
export function groupRows(items: Item[]): string[] {
  const boxes = items
    .map(({ poly, text }) => {
      const xs = poly.map((p) => p[0])
      const ys = poly.map((p) => p[1])
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
