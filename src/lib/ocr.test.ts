import { expect, test } from "vitest"
import { groupRows, mrzBand } from "./ocr"

const item = (x: number, y: number, w: number, text: string) => ({
  text,
  poly: [[x, y], [x + w, y], [x + w, y + 20], [x, y + 20]] as [number, number][],
})

test("groupRows joins boxes on one line left to right and orders lines top to bottom", () => {
  expect(
    groupRows([item(300, 402, 200, "<<<<<<<4"), item(10, 300, 200, "PASSPORT"), item(10, 400, 280, "C01X00T478D<<6408125F")]),
  ).toEqual(["PASSPORT", "C01X00T478D<<6408125F <<<<<<<4"])
})

// Phone photos are rarely level: turn the whole page by `deg` degrees (clockwise, y points down).
const turn = (deg: number, { text, poly }: ReturnType<typeof item>) => {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
  return { text, poly: poly.map(([x, y]) => [x * c - y * s, x * s + y * c] as [number, number]) }
}

test.each([10, -10, 25, 90])("groupRows keeps MRZ lines apart on a page turned by %i°", (deg) => {
  const page = [item(10, 300, 200, "PASSPORT"), item(10, 400, 280, "P<UTOERIKSSON"), item(300, 402, 200, "<<<<<<<<"), item(10, 440, 500, "L898902C36UTO")]
  expect(groupRows(page.map((b) => turn(deg, b)))).toEqual(["PASSPORT", "P<UTOERIKSSON <<<<<<<<", "L898902C36UTO"])
})

test("mrzBand frames the MRZ boxes of a small photo with a line of margin and enlarges them", () => {
  // Boxes from a 933×1000 Belarusian passport sample: line 1 came in two fragments, line 2 whole.
  const box = (x: number, y: number, w: number, h: number, text: string) => ({ text, poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as [number, number][] })
  const band = mrzBand(
    [box(551, 704, 121, 19, "INTERNAL AFFAIRS"), box(235, 769, 166, 17, "P<BLRJOHNSON<<E"), box(606, 776, 99, 16, "<<<<<<<<<"), box(233, 789, 473, 26, "KB12345671BLR8802026F08020191234567A123PB134")],
    933,
    1000,
  )
  expect(band).toEqual({ x: 207, y: 743, w: 525, h: 98, scale: 64 / 26 })
  expect(mrzBand([box(551, 704, 121, 19, "INTERNAL AFFAIRS"), box(550, 636, 119, 18, "1234567A123PB1")], 933, 1000)).toBeNull()
})
