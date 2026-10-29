export type Source = "mrz" | "check" | "manual"

// Keys are stable ids used by layout.ts; values are the labels shown in the form.
export const OPTIONS = {
  sex: { M: "Мужской", F: "Женский", X: "Иное" },
  maritalStatus: {
    single: "Холост / не замужем",
    married: "Женат / замужем",
    partnership: "Зарегистрированное партнёрство",
    separated: "Не проживает с супругом",
    divorced: "В разводе",
    widowed: "Вдовец / вдова",
    other: "Иное",
  },
  docType: {
    ordinary: "Обычный паспорт",
    diplomatic: "Дипломатический паспорт",
    service: "Служебный паспорт",
    official: "Официальный паспорт",
    special: "Специальный паспорт",
    other: "Иной документ",
  },
  residesElsewhere: { no: "Нет", yes: "Да" },
  purpose: {
    tourism: "Туризм",
    business: "Деловая",
    family: "Посещение родственников или друзей",
    culture: "Культура",
    sport: "Спорт",
    official: "Официальный визит",
    medical: "Лечение",
    study: "Учёба",
    transit: "Аэропортовый транзит",
    other: "Иное",
  },
  entries: { one: "Однократный", two: "Двукратный", multiple: "Многократный" },
  fingerprints: { no: "Нет", yes: "Да" },
  payer: { self: "Сам заявитель", sponsor: "Спонсор" },
} satisfies Record<string, Record<string, string>>

export type ChoiceKey = keyof typeof OPTIONS

export const MEANS = {
  self: {
    cash: "Наличные",
    cheques: "Дорожные чеки",
    card: "Кредитная карта",
    accommodation: "Проживание предоплачено",
    transport: "Транспорт оплачен",
    other: "Иное",
  },
  sponsor: {
    cash: "Наличные",
    accommodation: "Обеспечивается проживание",
    allCovered: "Все расходы оплачены",
    transport: "Транспорт оплачен",
    other: "Иное",
  },
} satisfies Record<string, Record<string, string>>

export const TEXT_KEYS = [
  "surname", "surnameAtBirth", "firstName", "birthDate", "placeOfBirth", "countryOfBirth",
  "nationality", "nationalityAtBirth", "nationalId", "docNumber", "issueDate", "expiryDate", "issuedBy",
  "address1", "address2", "email", "phone", "profession", "destination", "firstEntry",
  "arrivalDate", "departureDate", "host", "hostAddress1", "hostAddress2", "hostPhone",
  "sponsorWho", "place", "signDate",
] as const

export type TextKey = (typeof TEXT_KEYS)[number]
export type Values = Record<TextKey | ChoiceKey, string> & { means: string[] }
export type Sources = Partial<Record<keyof Values, Source>>

// Stored as ISO yyyy-mm-dd (or the unfinished text, see parseDmy), typed as dd.mm.yyyy, printed as dd-mm-yyyy.
export const DATE_KEYS: readonly TextKey[] = ["birthDate", "issueDate", "expiryDate", "arrivalDate", "departureDate", "signDate"]
export const REQUIRED: readonly TextKey[] = ["surname", "firstName", "birthDate", "nationality", "docNumber", "expiryDate"]

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export const toDmy = (iso: string, sep = "-") => iso.split("-").reverse().join(sep)

// The date itself if it exists on the calendar, "" for one like 2020-02-31.
export function realIso(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  return !isNaN(+d) && d.toISOString().startsWith(iso) ? iso : ""
}

// Dots appear as the digits arrive: a phone's numeric keypad has none.
export function maskDmy(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join(".")
}

// What a date field stores: ISO once the typed dd.mm.yyyy is a real date, the text as typed until then,
// so validate() can flag it instead of the PDF going out with a blank.
export const parseDmy = (text: string) =>
  (/^\d{2}\.\d{2}\.\d{4}$/.test(text) && realIso(toDmy(text.replaceAll(".", "-")))) || text

export const showDmy = (value: string) => (realIso(value) ? toDmy(value, ".") : value)

export function emptyValues(today = new Date()): Values {
  const blank = Object.fromEntries([...TEXT_KEYS, ...Object.keys(OPTIONS)].map((k) => [k, ""]))
  return {
    ...(blank as Record<TextKey | ChoiceKey, string>),
    docType: "ordinary",
    residesElsewhere: "no",
    fingerprints: "no",
    payer: "self",
    means: [],
    signDate: isoDate(today),
  }
}
