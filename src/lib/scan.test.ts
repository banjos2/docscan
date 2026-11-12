import { beforeEach, expect, test, vi } from "vitest"
import { MrzNotFoundError } from "./mrz"
import { recognize, turnOver } from "./ocr"
import { readMrz } from "./scan"

vi.mock("./ocr", () => ({ recognize: vi.fn(), turnOver: vi.fn(async (image: Blob) => image) }))

// ICAO 9303's specimen passport.
const MRZ = ["P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36UTO7408122F1204159ZE184226B<<<<<10"]
const pages = [new Blob(["signature page"]), new Blob(["data page"])]

beforeEach(() => vi.clearAllMocks())

test("readMrz reads a PDF's pages in order and returns the one with the MRZ", async () => {
  vi.mocked(recognize).mockImplementation(async (image) => (image === pages[1] ? MRZ : ["REPUBLIC OF UTOPIA"]))
  const found = await readMrz(pages)
  expect(found.image).toBe(pages[1])
  expect(found.values.surname).toBe("ERIKSSON")
  expect(turnOver).not.toHaveBeenCalled()
})

test("readMrz turns the pages over only after every page failed upright, then gives up", async () => {
  vi.mocked(recognize).mockResolvedValue(["REPUBLIC OF UTOPIA"])
  await expect(readMrz(pages)).rejects.toBeInstanceOf(MrzNotFoundError)
  expect(recognize).toHaveBeenCalledTimes(4)
  expect(vi.mocked(turnOver).mock.calls.map(([image]) => image)).toEqual(pages)
})
