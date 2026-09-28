import type { ChoiceKey, MEANS, OPTIONS, TextKey } from "./anketa"

export type Pos = { page: number; x: number; y: number }
export type TextPos = Pos & { size: number; maxWidth: number }

const at = (page: number, x: number, y: number, size: number, maxWidth: number): TextPos => ({ page, x, y, size, maxWidth })
const box = (page: number, x: number, y: number): Pos => ({ page, x, y })

export const TEXT: Record<TextKey, TextPos> = {
  surname: at(0, 51, 589.8, 11, 390),
  surnameAtBirth: at(0, 51, 560.9, 11, 390),
  firstName: at(0, 51, 532.5, 11, 390),
  birthDate: at(0, 79.4, 477.3, 11, 100),
  placeOfBirth: at(0, 194, 493.6, 11, 118),
  countryOfBirth: at(0, 194, 441.6, 11, 118),
  nationality: at(0, 333.8, 498.6, 11, 112),
  nationalityAtBirth: at(0, 378.4, 460, 11, 70),
  nationalId: at(0, 229.7, 257.1, 10, 215),
  docNumber: at(0, 85.7, 161.4, 10, 80),
  issueDate: at(0, 174, 161.4, 10, 75),
  expiryDate: at(0, 264.4, 161.4, 10, 65),
  issuedBy: at(0, 350.8, 161.4, 10, 95),
  address1: at(1, 51, 659.7, 9, 240),
  address2: at(1, 51, 650.7, 9, 240),
  email: at(1, 51, 641.7, 9, 240),
  phone: at(1, 336.4, 652.3, 9, 210),
  profession: at(1, 296.9, 561.4, 9, 250),
  destination: at(1, 91, 366.4, 11, 200),
  firstEntry: at(1, 320.6, 368.5, 11, 225),
  arrivalDate: at(1, 390, 287.1, 10, 150),
  departureDate: at(1, 390, 264.4, 10, 150),
  host: at(1, 51.5, 118.9, 11, 490),
  hostAddress1: at(2, 53.1, 751.1, 11, 240),
  hostAddress2: at(2, 53.1, 740.1, 11, 240),
  hostPhone: at(2, 337.9, 746.9, 11, 210),
  sponsorWho: at(2, 409.9, 553.4, 6, 130),
  place: at(3, 70.9, 107.3, 11, 200),
  signDate: at(3, 70.9, 96.3, 11, 200),
}

export const BOXES: { [K in ChoiceKey]: Record<keyof (typeof OPTIONS)[K], Pos> } = {
  sex: { M: box(0, 55.6, 391.2), F: box(0, 121, 391.2), X: box(0, 182.6, 391.2) },
  maritalStatus: {
    single: box(0, 238.3, 391.2),
    married: box(0, 350.5, 391.2),
    partnership: box(0, 273.5, 382.1),
    separated: box(0, 282.4, 372.8),
    divorced: box(0, 238.3, 363.6),
    widowed: box(0, 325, 363.6),
    other: box(0, 400.9, 363.6),
  },
  docType: {
    ordinary: box(0, 55.6, 224.2),
    diplomatic: box(0, 191.6, 224.2),
    service: box(0, 365.7, 224.2),
    official: box(0, 125.4, 213.5),
    special: box(0, 268.3, 213.5),
    other: box(0, 414.5, 213.5),
  },
  residesElsewhere: { no: box(1, 48.2, 606.1), yes: box(1, 48.2, 596.9) },
  purpose: {
    tourism: box(1, 48.2, 485),
    business: box(1, 115.8, 485),
    family: box(1, 185.2, 485),
    culture: box(1, 417.2, 485),
    sport: box(1, 486.5, 485),
    official: box(1, 48.2, 475.8),
    medical: box(1, 170.7, 475.8),
    study: box(1, 269.8, 475.8),
    transit: box(1, 329.3, 475.8),
    other: box(1, 490.8, 475.8),
  },
  entries: { one: box(1, 55.6, 317), two: box(1, 128.8, 317), multiple: box(1, 195, 317) },
  fingerprints: { no: box(1, 147.8, 241), yes: box(1, 185.9, 241) },
  payer: { self: box(2, 55.6, 587.8), sponsor: box(2, 265.9, 587.8) },
}

// Item 33, sponsor column: "otro (especifíquese)" — ticked when the sponsor is named.
export const SPONSOR_OTHER = box(2, 283.7, 550.9)

export const MEANS_BOXES: { [K in keyof typeof MEANS]: Record<keyof (typeof MEANS)[K], Pos> } = {
  self: {
    cash: box(2, 55.6, 541.8),
    cheques: box(2, 55.6, 532.6),
    card: box(2, 55.6, 523.3),
    accommodation: box(2, 55.6, 514.2),
    transport: box(2, 55.6, 505),
    other: box(2, 55.6, 495.7),
  },
  sponsor: {
    cash: box(2, 269.1, 514.2),
    accommodation: box(2, 269.3, 505),
    allCovered: box(2, 269.5, 495.7),
    transport: box(2, 269.7, 477.4),
    other: box(2, 270.4, 468.1),
  },
}
