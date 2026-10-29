import { DATE_KEYS, isoDate, realIso, REQUIRED, TEXT_KEYS, type Values } from "./anketa"

export type Errors = Partial<Record<keyof Values, string>>

// Helvetica in the PDF encodes WinAnsi; Latin-1 is its safe subset.
const LATIN = /^[\x20-\x7E\xA0-\xFF]*$/

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10)
}

export function validate(v: Values, today = new Date()): { errors: Errors; warnings: string[] } {
  const errors: Errors = {}
  for (const k of REQUIRED) if (!v[k].trim()) errors[k] = "Обязательное поле"
  for (const k of TEXT_KEYS) {
    if (k === "sponsorWho" && v.payer !== "sponsor") continue
    if (!LATIN.test(v[k])) errors[k] = "Анкета заполняется латиницей"
  }

  // A date field holds the typed text until it is a real date (see parseDmy): that text must not reach the PDF.
  for (const k of DATE_KEYS) if (v[k] && !realIso(v[k])) errors[k] = "Проверьте дату: ДД.ММ.ГГГГ"

  const t = isoDate(today)
  const [expiry, departure, issue, birth] = (["expiryDate", "departureDate", "issueDate", "birthDate"] as const).map((k) => realIso(v[k]))
  const warnings: string[] = []
  if (expiry && expiry < t) warnings.push("Срок действия паспорта истёк.")
  if (expiry && departure && expiry < addMonths(departure, 3))
    warnings.push("Паспорт должен действовать ещё минимум 3 месяца после выезда из Шенгена (п. 28).")
  if (issue && issue < addMonths(t, -120)) warnings.push("Паспорт выдан больше 10 лет назад: для шенгенской визы он не подойдёт.")
  if (birth && birth > t) warnings.push("Дата рождения в будущем, проверьте п. 4.")
  return { errors, warnings }
}
