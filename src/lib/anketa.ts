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

// Stored as ISO yyyy-mm-dd (what <input type="date"> uses), printed as dd-mm-yyyy.
export const DATE_KEYS: readonly TextKey[] = ["birthDate", "issueDate", "expiryDate", "arrivalDate", "departureDate", "signDate"]
export const REQUIRED: readonly TextKey[] = ["surname", "firstName", "birthDate", "nationality", "docNumber", "expiryDate"]

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export const toDmy = (iso: string) => iso.split("-").reverse().join("-")

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
