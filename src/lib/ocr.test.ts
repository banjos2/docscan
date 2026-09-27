import { expect, test } from "vitest"
import { groupRows } from "./ocr"

const item = (x: number, y: number, w: number, text: string) => ({
  text,
  poly: [[x, y], [x + w, y], [x + w, y + 20], [x, y + 20]] as [number, number][],
})

test("groupRows joins boxes on one line left to right and orders lines top to bottom", () => {
  expect(
    groupRows([item(300, 402, 200, "<<<<<<<4"), item(10, 300, 200, "PASSPORT"), item(10, 400, 280, "C01X00T478D<<6408125F")]),
  ).toEqual(["PASSPORT", "C01X00T478D<<6408125F <<<<<<<4"])
})
