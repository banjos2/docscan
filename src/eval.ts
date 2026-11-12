import { score, type Case } from "@/lib/eval"
import { imagesOf, readMrz } from "@/lib/scan"

const input = document.querySelector("input")!
const out = document.querySelector("pre")!

// The same passes as App's scan(). A photo that breaks the OCR or shows no MRZ counts as rejected.
async function read(file: File): Promise<string[] | null> {
  try {
    return (await readMrz(await imagesOf(file))).rows
  } catch {
    return null
  }
}

input.onchange = async () => {
  const files = Array.from(input.files ?? [])
  const truthFile = files.find((f) => f.name === "truth.json")
  if (!truthFile) {
    out.textContent = "В папке нет truth.json"
    return
  }
  // { "photo.jpg": ["MRZ line 1", "MRZ line 2"], … }
  const truth = JSON.parse(await truthFile.text()) as Record<string, string[]>
  const photos = files.filter((f) => truth[f.name])
  const cases: Case[] = []
  for (const [i, file] of photos.entries()) {
    out.textContent = `${i + 1} / ${photos.length}`
    cases.push({ truth: truth[file.name], rows: await read(file) })
  }
  out.textContent = JSON.stringify(score(cases), null, 2)
}
