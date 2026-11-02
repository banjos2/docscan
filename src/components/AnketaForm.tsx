import type { ReactNode } from "react"
import { DateField } from "@/components/DateField"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACTUAL_ADDRESS, EMPLOYMENT, HOST_KIND, ITEM_OF, MEANS, OPTIONS, SCHENGEN, visible, type ChoiceKey, type Source, type Sources, type TextKey, type Values } from "@/lib/anketa"
import { CITIES } from "@/lib/cities"
import { printedText, type PrintKey } from "@/lib/print"
import { inItemOrder, itemLabel, itemNumber, itemsNote, offered, QUESTIONNAIRES, type Questionnaire } from "@/lib/questionnaire"
import { cn } from "@/lib/utils"
import type { Errors } from "@/lib/validate"

type Field = {
  key: keyof Values
  // Without the item number: the blank gives it (itemLabel). Items 1–16 are numbered here, on every blank alike.
  label: string | ((v: Values) => string)
  type?: "text" | "date" | "email" | "tel" | "select" | "means"
  wide?: boolean
  // Choices of a select; the options of OPTIONS[key] the blank has a box for when absent.
  options?: (q: Questionnaire) => Record<string, string>
  // The blank's cell that shows this value as printed: "в анкете: ..." under the field.
  hint?: PrintKey
}

const SECTIONS: { title: string; description: string; fromDoc?: boolean; fields: Field[] }[] = [
  {
    title: "Из документа",
    description: "Пункты 1–16. Заполняются из MRZ, остальное введите вручную.",
    fromDoc: true,
    fields: [
      { key: "surname", label: "1. Фамилия", wide: true },
      { key: "surnameAtBirth", label: "2. Фамилия при рождении", wide: true },
      { key: "firstName", label: "3. Имя", wide: true },
      { key: "birthDate", label: "4. Дата рождения", type: "date" },
      { key: "placeOfBirth", label: "5. Место рождения" },
      { key: "countryOfBirth", label: "6. Страна рождения" },
      { key: "nationality", label: "7. Гражданство" },
      { key: "nationalityAtBirth", label: "7. Гражданство при рождении" },
      { key: "sex", label: "8. Пол", type: "select" },
      { key: "maritalStatus", label: "9. Семейное положение", type: "select" },
      { key: "nationalId", label: "11. Идентификационный номер" },
      { key: "docType", label: "12. Тип документа", type: "select" },
      { key: "docNumber", label: "13. Номер документа" },
      { key: "issueDate", label: "14. Дата выдачи", type: "date" },
      { key: "expiryDate", label: "15. Действителен до", type: "date" },
      { key: "issuedBy", label: "16. Страна выдачи" },
    ],
  },
  {
    title: "Адрес и контакты",
    description: "Этих данных нет в документе.",
    fields: [
      { key: "regCountry", label: "Прописка: страна" },
      { key: "regCity", label: "Прописка: город" },
      { key: "regStreet", label: "Прописка: улица", wide: true },
      { key: "regHouse", label: "Прописка: дом" },
      { key: "regFlat", label: "Прописка: квартира" },
      { key: "regPostcode", label: "Прописка: индекс" },
      { key: "actualDiffers", label: "Фактический адрес", type: "select", options: () => ACTUAL_ADDRESS, wide: true },
      { key: "actualCountry", label: "Фактический адрес: страна" },
      { key: "actualCity", label: "Фактический адрес: город" },
      { key: "actualStreet", label: "Фактический адрес: улица", wide: true },
      { key: "actualHouse", label: "Фактический адрес: дом" },
      { key: "actualFlat", label: "Фактический адрес: квартира" },
      { key: "actualPostcode", label: "Фактический адрес: индекс" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "phone", label: "Телефон", type: "tel" },
      { key: "residesElsewhere", label: "Живёте не в стране гражданства", type: "select" },
    ],
  },
  {
    title: "Работа или учёба",
    description: "Что спрашивать дальше, зависит от статуса.",
    fields: [
      { key: "employment", label: "Статус занятости", type: "select", options: () => EMPLOYMENT, hint: "profession" },
      { key: "position", label: "Должность" },
      {
        key: "employerName",
        label: (v) => (v.employment === "pupil" || v.employment === "student" ? "Учебное заведение" : "Место работы"),
        wide: true,
      },
      { key: "employerAddress", label: "Адрес", wide: true },
      { key: "employerPhone", label: "Телефон", type: "tel" },
      { key: "employerEmail", label: "E-mail (в анкету не печатается)", type: "email" },
    ],
  },
  {
    title: "Поездка",
    description: "Этих данных нет в документе.",
    fields: [
      { key: "purpose", label: "Цель поездки", type: "select" },
      { key: "kpNumber", label: "Номер Карты поляка" },
      { key: "basis", label: "Основание" },
      { key: "destination", label: "Страна назначения" },
      { key: "firstEntry", label: "Страна первого въезда", type: "select", options: () => SCHENGEN, hint: "firstEntry" },
      { key: "entries", label: "Количество въездов", type: "select" },
      // Wide, so each period's "с" and "по" share a row.
      { key: "prevVisas", label: "Визы за последние 5 лет", type: "select", wide: true },
      ...[1, 2, 3, 4, 5].flatMap((n): Field[] => [
        { key: `prevVisa${n}From` as TextKey, label: `Виза ${n}: с`, type: "date" },
        { key: `prevVisa${n}To` as TextKey, label: `Виза ${n}: по`, type: "date" },
      ]),
      { key: "arrivalDate", label: "Дата въезда", type: "date" },
      { key: "departureDate", label: "Дата выезда", type: "date" },
      { key: "fingerprints", label: "Сдавали отпечатки для шенгенской визы", type: "select" },
    ],
  },
  {
    title: "Приглашающая сторона",
    description: "Необязательные поля: частное лицо или гостиница, и организация.",
    fields: [
      { key: "hostKind", label: "Кто приглашает", type: "select", options: () => HOST_KIND, wide: true },
      { key: "hostSurname", label: "Фамилия" },
      { key: "hostFirstName", label: "Имя" },
      { key: "hotelName", label: "Название гостиницы" },
      { key: "hostAddress", label: "Адрес", wide: true },
      { key: "hostPhone", label: "Телефон", type: "tel" },
      { key: "hostEmail", label: "E-mail", type: "email" },
      { key: "orgName", label: "Организация", wide: true },
      { key: "orgAddress", label: "Адрес организации", wide: true },
      { key: "orgContactSurname", label: "Фамилия контактного лица" },
      { key: "orgContactFirstName", label: "Имя контактного лица" },
      { key: "orgPhone", label: "Телефон", type: "tel" },
      { key: "orgEmail", label: "E-mail контактного лица", type: "email" },
    ],
  },
  {
    title: "Расходы и подача",
    description: "Этих данных нет в документе.",
    fields: [
      { key: "payer", label: "Расходы оплачивает", type: "select" },
      { key: "sponsorWho", label: "Кто спонсор" },
      { key: "means", label: "Средства", type: "means", wide: true },
      { key: "workPermit", label: "Разрешение на работу", wide: true },
      {
        key: "submissionCity",
        label: "Город подачи",
        type: "select",
        options: (q) => Object.fromEntries(CITIES[q.country].map((c) => [c.id, c.ru])),
        hint: "place",
      },
      { key: "submissionDate", label: "Дата подачи", type: "date" },
    ],
  },
]

// A field as shown: its label read for these values and numbered by the blank.
type Labelled = Omit<Field, "label"> & { label: string }

// Several fields of one blank item read "19.1.", "19.2." … instead of repeating "19.", numbered over the fields shown.
function subNumbered(fields: Labelled[]): Labelled[] {
  const item = (label: string) => /^(\d+)\. /.exec(label)?.[1]
  const seen: Record<string, number> = {}
  return fields.map((f) => {
    const n = item(f.label)
    if (!n || fields.filter((g) => item(g.label) === n).length < 2) return f
    seen[n] = (seen[n] ?? 0) + 1
    return { ...f, label: f.label.replace(`${n}. `, `${n}.${seen[n]}. `) }
  })
}

type Props = {
  values: Values
  sources: Sources
  errors: Errors
  questionnaire: Questionnaire
  onChange: (key: keyof Values, value: string | string[]) => void
  onQuestionnaire: (q: Questionnaire) => void
}

export function AnketaForm({ values, sources, errors, questionnaire, onChange, onQuestionnaire }: Props) {
  const scanned = Object.keys(sources).length > 0
  const printed = printedText(values, questionnaire)
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Анкета</CardTitle>
          <CardDescription>От анкеты зависят бланк, пункты и их номера, список городов и предустановки.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {/* The card's title says it already. */}
            <Label htmlFor="field-questionnaire" className="sr-only">
              Анкета
            </Label>
            <ChoiceSelect
              id="field-questionnaire"
              value={questionnaire.id}
              options={Object.fromEntries(QUESTIONNAIRES.map((q) => [q.id, q.label]))}
              onChange={(id) => {
                const next = QUESTIONNAIRES.find((q) => q.id === id)
                if (next) onQuestionnaire(next)
              }}
            />
          </div>
        </CardContent>
      </Card>
      {SECTIONS.map((s) => {
        const { items } = questionnaire
        const shown = inItemOrder(s.fields.filter((f) => visible(f.key, values, items)), items)
        const numbers = shown.flatMap((f) => itemNumber(ITEM_OF[f.key], items) ?? [])
        const labelled = shown.map((f) => ({ ...f, label: itemLabel(typeof f.label === "function" ? f.label(values) : f.label, ITEM_OF[f.key], items) }))
        return (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
              <CardDescription>{[itemsNote(numbers), s.description].filter(Boolean).join(". ")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              {subNumbered(labelled).map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  values={values}
                  questionnaire={questionnaire}
                  printed={printed}
                  error={errors[f.key]}
                  badge={s.fromDoc && scanned ? <SourceBadge source={sources[f.key]} /> : null}
                  onChange={onChange}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}

function SourceBadge({ source }: { source?: Source }) {
  if (source === "mrz") return <Badge variant="secondary">MRZ</Badge>
  if (source === "check")
    return (
      <Badge variant="outline">
        <span className="size-1.5 rounded-full bg-flame" aria-hidden />
        проверьте
      </Badge>
    )
  return <Badge variant="outline">вручную</Badge>
}

function ChoiceSelect({
  id,
  value,
  options,
  invalid,
  describedBy,
  onChange,
}: {
  id: string
  value: string
  options: Record<string, string>
  invalid?: boolean
  describedBy?: string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid} aria-describedby={describedBy}>
        <SelectValue placeholder="Выберите" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function FieldRow({
  field: f,
  values,
  questionnaire,
  printed,
  error,
  badge,
  onChange,
}: {
  field: Labelled
  values: Values
  questionnaire: Questionnaire
  printed: Partial<Record<PrintKey, string>>
  error?: string
  badge: ReactNode
  onChange: Props["onChange"]
}) {
  const id = `field-${f.key}`
  const errorId = error ? `${id}-error` : undefined
  const hint = f.hint && printed[f.hint]
  const hintId = hint ? `${id}-hint` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined
  let control: ReactNode
  if (f.type === "select") {
    control = (
      <ChoiceSelect
        id={id}
        value={values[f.key] as string}
        options={f.options ? f.options(questionnaire) : offered(questionnaire.blank, f.key, OPTIONS[f.key as ChoiceKey])}
        invalid={!!error}
        describedBy={describedBy}
        onChange={(v) => onChange(f.key, v)}
      />
    )
  } else if (f.type === "means") {
    const options = offered(questionnaire.blank, `means.${values.payer}`, MEANS[values.payer as keyof typeof MEANS] ?? {})
    control = (
      <div role="group" aria-labelledby={`${id}-label`} className="grid gap-2 sm:grid-cols-2">
        {Object.entries(options).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={values.means.includes(k)}
              onCheckedChange={(c) => onChange("means", c === true ? [...values.means, k] : values.means.filter((m) => m !== k))}
            />
            {label}
          </label>
        ))}
      </div>
    )
  } else if (f.type === "date") {
    control = (
      <DateField
        id={id}
        value={values[f.key] as string}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        onChange={(iso) => onChange(f.key, iso)}
      />
    )
  } else {
    control = (
      <Input
        id={id}
        type={f.type ?? "text"}
        value={values[f.key] as string}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        onChange={(e) => onChange(f.key, e.target.value)}
      />
    )
  }
  return (
    <div className={cn("flex flex-col gap-2", f.wide && "sm:col-span-2")}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        {f.type === "means" ? (
          <span id={`${id}-label`} className="text-sm font-medium">
            {f.label}
          </span>
        ) : (
          <Label htmlFor={id}>{f.label}</Label>
        )}
        {badge}
      </div>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          в анкете: {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
