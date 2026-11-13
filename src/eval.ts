import { score, type Case, type Report } from "@/lib/eval"
import { imagesOf, readMrz } from "@/lib/scan"

type Ctx = OffscreenCanvasRenderingContext2D

// One way an upload differs from a good photo. Every number is fixed, the noise included, so that two runs differ
// only by what the recognition does.
type Variant = {
  name: string
  side?: number // long side, px
  quality?: number // JPEG quality, 0–1
  filter?: string // canvas filter
  turn?: number // degrees clockwise
  shear?: number // x shifts by this share of y: a page that lies askew
  squeeze?: number // width kept, as a share: a page shot from the side
  bottom?: number // the share of the height kept, from the bottom: the data page alone
  noise?: number // amplitude per channel, of 255
  over?: (g: Ctx, w: number, h: number) => void
}

const shadow = (g: Ctx, w: number, h: number) => {
  const fill = g.createLinearGradient(0, h, w * 0.7, h * 0.3)
  fill.addColorStop(0, "rgba(40, 20, 60, 0.75)")
  fill.addColorStop(1, "rgba(40, 20, 60, 0)")
  g.fillStyle = fill
  g.fillRect(0, 0, w, h)
}

// A lamp's reflection over the end of the MRZ lines.
const glare = (g: Ctx, w: number, h: number) => {
  const fill = g.createRadialGradient(w * 0.8, h * 0.9, 0, w * 0.8, h * 0.9, w * 0.25)
  fill.addColorStop(0, "rgba(255, 255, 255, 0.9)")
  fill.addColorStop(1, "rgba(255, 255, 255, 0)")
  g.fillStyle = fill
  g.fillRect(0, 0, w, h)
}

const VARIANTS: Variant[] = [
  { name: "как есть" },
  { name: "1000 px", side: 1000 },
  { name: "700 px", side: 700 },
  { name: "500 px", side: 500 },
  { name: "JPEG 20 %", quality: 0.2 },
  { name: "мессенджер: 800 px, JPEG 30 %", side: 800, quality: 0.3 },
  { name: "ч/б", filter: "grayscale(1)" },
  { name: "ксерокопия контрастная", filter: "grayscale(1) contrast(3) brightness(1.1)" },
  { name: "ксерокопия бледная", filter: "grayscale(1) contrast(0.5) brightness(1.4)" },
  { name: "темно", filter: "brightness(0.4)" },
  { name: "пересвет", filter: "brightness(1.6)" },
  { name: "размытие 1,5 px", filter: "blur(1.5px)" },
  { name: "размытие 3 px", filter: "blur(3px)" },
  { name: "шум", noise: 40 },
  { name: "наклон 5°", turn: 5 },
  { name: "наклон −8°", turn: -8 },
  { name: "наклон 15°", turn: 15 },
  { name: "боком 90°", turn: 90 },
  { name: "боком 270°", turn: 270 },
  { name: "вверх ногами", turn: 180 },
  { name: "перекос", shear: 0.2 },
  { name: "снято сбоку", squeeze: 0.7 },
  { name: "тень", over: shadow },
  { name: "блик на MRZ", over: glare },
  { name: "только страница с фото", bottom: 0.5 },
  { name: "фото ксерокопии: ч/б, тень, 700 px", side: 700, filter: "grayscale(1) contrast(1.6)", turn: -2, over: shadow },
]

async function render(image: Blob, v: Variant): Promise<Blob> {
  const photo = await createImageBitmap(image)
  const top = Math.round(photo.height * (1 - (v.bottom ?? 1)))
  const [sw, sh] = [photo.width, photo.height - top]
  const k = Math.min(1, (v.side ?? Infinity) / Math.max(sw, sh))
  const [w, h] = [sw * k * (v.squeeze ?? 1), sh * k]
  const a = ((v.turn ?? 0) * Math.PI) / 180
  const shear = v.shear ?? 0
  // The frame that holds the turned page; what the page leaves bare is the table under it.
  const cw = Math.ceil(Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)) + Math.abs(shear) * h)
  const ch = Math.ceil(Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)))
  const canvas = new OffscreenCanvas(cw, ch)
  const g = canvas.getContext("2d")
  if (!g) throw new Error("No 2D canvas context.")
  g.fillStyle = "#777"
  g.fillRect(0, 0, cw, ch)
  g.imageSmoothingQuality = "high"
  g.filter = v.filter ?? "none"
  g.translate(cw / 2, ch / 2)
  g.rotate(a)
  g.transform(1, 0, shear, 1, 0, 0)
  g.drawImage(photo, 0, top, sw, sh, -w / 2, -h / 2, w, h)
  photo.close()
  g.resetTransform()
  g.filter = "none"
  v.over?.(g, cw, ch)
  if (v.noise) {
    const px = g.getImageData(0, 0, cw, ch)
    let seed = 1
    for (let i = 0; i < px.data.length; i++) {
      if (i % 4 === 3) continue
      seed = (seed * 1664525 + 1013904223) >>> 0
      px.data[i] += ((seed >>> 16) / 32768 - 1) * v.noise
    }
    g.putImageData(px, 0, 0)
  }
  return canvas.convertToBlob({ type: "image/jpeg", quality: v.quality ?? 0.92 })
}

// The same passes as App's scan(). A photo that breaks the OCR or shows no MRZ counts as rejected.
async function read(images: Blob[]): Promise<string[] | null> {
  try {
    return (await readMrz(images)).rows
  } catch {
    return null
  }
}

const HEAD = ["вариант".padEnd(38), "фото", "отказ", "точно", "неверно со значком MRZ", "сек", "ошибки в полях"].join("  ")

// Totals and field names only: nothing a document says may reach the screen.
function line(name: string, r: Report, seconds: number) {
  const wrong = Object.entries(r.fields).flatMap(([f, c]) => (c.wrong ? [`${f}×${c.wrong}`] : []))
  const cells = [String(r.cases).padStart(4), String(r.rejected).padStart(5), String(r.exact).padStart(5), String(r.wrongVerified).padStart(22), seconds.toFixed(1).padStart(3)]
  return [name.padEnd(38), ...cells, wrong.join(" ")].join("  ")
}

// Every photo in every variant. `say` gets the table so far and what is being read now.
export async function run(files: File[], say: (text: string) => void): Promise<string> {
  const truthFile = files.find((f) => f.name === "truth.json")
  if (!truthFile) return "В папке нет truth.json"
  // { "photo.jpg": ["MRZ line 1", "MRZ line 2"], … }
  const truth = JSON.parse(await truthFile.text()) as Record<string, string[]>
  const photos = files.filter((f) => truth[f.name])
  const lines = [HEAD]
  const all: Case[] = []
  let total = 0
  for (const [n, v] of VARIANTS.entries()) {
    const cases: Case[] = []
    let ms = 0
    for (const [i, file] of photos.entries()) {
      say([...lines, "", `${n + 1} / ${VARIANTS.length}: ${v.name}, фото ${i + 1} / ${photos.length}`].join("\n"))
      const images = await Promise.all((await imagesOf(file)).map((image) => render(image, v)))
      const started = performance.now()
      cases.push({ truth: truth[file.name], rows: await read(images) })
      ms += performance.now() - started
    }
    all.push(...cases)
    total += ms
    lines.push(line(v.name, score(cases), ms / 1000 / cases.length))
  }
  return [...lines, "", line("всего", score(all), total / 1000 / all.length)].join("\n")
}

const input = document.querySelector("input")
const out = document.querySelector("pre")
if (input && out)
  input.onchange = async () => {
    out.textContent = await run(Array.from(input.files ?? []), (text) => (out.textContent = text))
  }
