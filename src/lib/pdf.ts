// Scanners save a passport as PDF. pdf.js and its worker (~1.7 MB) load only when one arrives.
// Some browsers leave file.type empty, hence the extension check.
export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name)

// ponytail: 3000 px on the long side gives the MRZ of a passport spread on A4 about 30 px lines, which the OCR's
// zoom reads; 6 pages cover a passport scan, a longer file is not one.
const SIDE = 3000
const MAX_PAGES = 6

// One image per page, in page order.
export async function pdfPages(file: Blob): Promise<Blob[]> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({
    data: await file.arrayBuffer(),
    // Self-hosted decoders for JBIG2 and JPEG 2000 scans, copied by scripts/fetch_assets.sh.
    wasmUrl: new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href).href,
  })
  try {
    const doc = await task.promise
    const pages: Blob[] = []
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n)
      const { width, height } = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: SIDE / Math.max(width, height) })
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      pages.push(await new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error("No page image."))), "image/jpeg", 0.92)))
    }
    return pages
  } finally {
    await task.destroy()
  }
}
