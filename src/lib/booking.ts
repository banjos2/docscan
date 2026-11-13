import { isoDate, realIso, SCHENGEN, type SchengenCode, type Values } from "./anketa"
import { COUNTRY_EN } from "./print"

export class BookingNotFoundError extends Error {
  constructor() {
    super("В файле не нашлись данные гостиницы. Подходит подтверждение бронирования Booking.com на русском языке, скачанное в PDF.")
  }
}

// Russian months and weekdays by their first letters, whatever the case and the ending ("МАРТ", "марта").
const MONTHS = ["янв", "фев", "мар", "апр", "ма", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
const WEEKDAYS = ["вос", "пон", "вт", "ср", "чет", "пят", "суб"]
const startsOne = (list: string[], word: string) => list.findIndex((s) => word.toLowerCase().startsWith(s))

// The day under a "ЗАЕЗД" or "ОТЪЕЗД" heading: day, month and weekday on a line each, and no year. The weekday
// names the year: the first from this one on in which the day falls on it. Without a weekday, the nearest day ahead.
function stayDate(text: string, heading: string, from: string): string {
  const [, day, month, weekday] = new RegExp(`^${heading}\\n(\\d{1,2})\\n(\\S+)\\n(\\S+)`, "m").exec(text) ?? []
  const m = startsOne(MONTHS, month ?? "")
  if (m < 0) return ""
  const on = startsOne(WEEKDAYS, weekday)
  for (let year = Number(from.slice(0, 4)); year <= Number(from.slice(0, 4)) + 3; year++) {
    const iso = realIso(`${year}-${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}`)
    if (iso && (on < 0 ? iso >= from : new Date(`${iso}T00:00:00Z`).getUTCDay() === on)) return iso
  }
  return ""
}

// The blanks print countries in English; the booking's last address part is the country in Russian.
function countryInEnglish(address: string): string {
  const parts = address.split(", ")
  const code = (Object.keys(SCHENGEN) as SchengenCode[]).find((c) => SCHENGEN[c] === parts.at(-1))
  return code ? [...parts.slice(0, -1), COUNTRY_EN[code]].join(", ") : address
}

// What a Booking.com confirmation says of the hotel and the stay. `text` is the PDF's text as pdfText gives it: the
// hotel's name sits on the line above its address, the address runs on to the phone.
export function parseBooking(text: string, today = new Date()): Partial<Values> {
  const [, name, address, phone] = /^(.+)\nАдрес:\s*([\s\S]+?)\nТелефон:\s*(.+)$/m.exec(text) ?? []
  if (!name) throw new BookingNotFoundError()
  const arrivalDate = stayDate(text, "ЗАЕЗД", isoDate(today))
  // The departure follows the arrival, which may be late in a year the departure is not in.
  const departureDate = stayDate(text, "ОТЪЕЗД", arrivalDate || isoDate(today))
  return {
    hostKind: "hotel",
    hotelName: name.trim(),
    hostAddress: countryInEnglish(address.replace(/\s*\n\s*/g, " ").trim()),
    hostPhone: phone.trim(),
    ...(arrivalDate && { arrivalDate }),
    ...(departureDate && { departureDate }),
  }
}
