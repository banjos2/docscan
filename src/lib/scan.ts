import { heicToJpeg, isHeic } from "./heic"
import { extract, MrzNotFoundError, type Rows } from "./mrz"
import { recognize, turnOver } from "./ocr"
import { isPdf, pdfPages } from "./pdf"

// The images a file holds: a photo is one, a PDF scan has one per page.
export async function imagesOf(file: File): Promise<Blob[]> {
  if (isPdf(file)) return pdfPages(file)
  return [isHeic(file) ? await heicToJpeg(file) : file]
}

export type Scan = ReturnType<typeof extract> & { rows: Rows; image: Blob }

// Every page upright first, then every page turned over: PaddleOCR.js has no page-orientation model and reads
// upside-down text as garbage (90° is read as is).
export async function readMrz(images: Blob[], onStatus?: (status: string) => void): Promise<Scan> {
  for (const turned of [false, true])
    for (const image of images) {
      const rows = await recognize(turned ? await turnOver(image) : image, () =>
        onStatus?.(turned ? "Переворачиваю фото и распознаю ещё раз…" : "Распознаю документ…"),
      )
      try {
        return { ...extract(rows), rows, image }
      } catch (e) {
        if (!(e instanceof MrzNotFoundError)) throw e
      }
    }
  throw new MrzNotFoundError()
}
