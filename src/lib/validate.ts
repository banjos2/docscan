import { isoDate, REQUIRED, TEXT_KEYS, type Values } from "./anketa"

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
  for (const k of TEXT_KEYS) if (!LATIN.test(v[k])) errors[k] = "Анкета заполняется латиницей"

  const t = isoDate(today)
  const warnings: string[] = []
  if (v.expiryDate && v.expiryDate < t) warnings.push("Срок действия паспорта истёк.")
  if (v.expiryDate && v.departureDate && v.expiryDate < addMonths(v.departureDate, 3))
    warnings.push("Паспорт должен действовать ещё минимум 3 месяца после выезда из Шенгена (п. 28).")
  if (v.issueDate && v.issueDate < addMonths(t, -120))
    warnings.push("Паспорт выдан больше 10 лет назад: для шенгенской визы он не подойдёт.")
  if (v.birthDate && v.birthDate > t) warnings.push("Дата рождения в будущем, проверьте п. 4.")
  return { errors, warnings }
}
