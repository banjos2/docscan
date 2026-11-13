import { expect, test } from "vitest"
import { BookingNotFoundError, parseBooking } from "./booking"

const TODAY = new Date("2026-11-13T12:00:00")
// The text of a Booking.com confirmation in Russian, in the order its PDF draws it; the hotel and the guest are made up.
const BOOKING = [
  "Hotel Example Centro",
  "Адрес: 1 Calle Ejemplo, Центр, 28001 Мадрид,",
  "Испания",
  "Телефон: +34 900 00 00 00",
  "Координаты GPS: N 040° 25.000, W 03° 42.000",
  "ЦЕНА:",
  "1 номер € 500",
  "Имя гостя: ANNA MARIA ERIKSSON",
  "Подтверждение бронирования",
  "НОМЕР ПОДТВЕРЖДЕНИЯ: 0000.000.000",
  "ЗАЕЗД",
  "10",
  "МАРТ",
  "среда",
  "с 16:00",
  "ОТЪЕЗД",
  "22",
  "МАРТ",
  "понедельник",
  "до 12:00",
].join("\n")

test("parseBooking takes the hotel, its address and phone and the dates of the stay", () => {
  expect(parseBooking(BOOKING, TODAY)).toEqual({
    hostKind: "hotel",
    hotelName: "Hotel Example Centro",
    // The country goes in English, as the blanks print countries; the rest stays as the booking has it.
    hostAddress: "1 Calle Ejemplo, Центр, 28001 Мадрид, SPAIN",
    hostPhone: "+34 900 00 00 00",
    arrivalDate: "2027-03-10",
    departureDate: "2027-03-22",
  })
})

test("parseBooking finds the year by the weekday: the booking prints none", () => {
  // 10 March is a Tuesday in 2026 and a Wednesday in 2027.
  expect(parseBooking(BOOKING, new Date("2026-01-05T12:00:00")).arrivalDate).toBe("2027-03-10")
  // Without a weekday it knows, the nearest such day ahead.
  expect(parseBooking(BOOKING.replace("среда", "—"), new Date("2026-01-05T12:00:00")).arrivalDate).toBe("2026-03-10")
  expect(parseBooking(BOOKING.replace("среда", "—"), TODAY).arrivalDate).toBe("2027-03-10")
})

test("parseBooking carries a stay over the new year", () => {
  const winter = BOOKING.replace("10\nМАРТ\nсреда", "28\nДЕКАБРЬ\nпонедельник").replace("22\nМАРТ\nпонедельник", "4\nЯНВАРЬ\nпонедельник")
  expect(parseBooking(winter, TODAY)).toMatchObject({ arrivalDate: "2026-12-28", departureDate: "2027-01-04" })
})

test("parseBooking leaves out the dates it cannot read and still gives the hotel", () => {
  const found = parseBooking(BOOKING.replace("МАРТ\nсреда", "???\nсреда"), TODAY)
  expect(found).toMatchObject({ hotelName: "Hotel Example Centro", departureDate: "2027-03-22" })
  expect(found).not.toHaveProperty("arrivalDate")
})

test("parseBooking refuses a file that is not such a confirmation", () => {
  expect(() => parseBooking("Счёт на оплату\nТелефон: +375 00 000 00 00", TODAY)).toThrow(BookingNotFoundError)
  expect(() => parseBooking("", TODAY)).toThrow(BookingNotFoundError)
})
