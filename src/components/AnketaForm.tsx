import type { ReactNode } from "react"
import { DateField } from "@/components/DateField"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACTUAL_ADDRESS, EMPLOYMENT, HOST_KIND, MEANS, OPTIONS, SCHENGEN, visible, type ChoiceKey, type Source, type Sources, type Values } from "@/lib/anketa"
import { CITIES } from "@/lib/cities"
import { printedText } from "@/lib/print"
import { TEMPLATES, type PrintKey, type Template } from "@/lib/template"
import { cn } from "@/lib/utils"
import type { Errors } from "@/lib/validate"

type Field = {
  key: keyof Values
  label: string | ((v: Values) => string)
  type?: "text" | "date" | "email" | "tel" | "select" | "means"
  wide?: boolean
  // Choices of a select; OPTIONS[key] when absent.
  options?: (t: Template) => Record<string, string>
  // The blank's cell that shows this value in the template's language: "в анкете: ..." under the field.
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
    description: "Пункты 19–20. Этих данных нет в документе.",
    fields: [
      { key: "regCountry", label: "19. Прописка: страна" },
      { key: "regCity", label: "19. Прописка: город" },
      { key: "regStreet", label: "19. Прописка: улица", wide: true },
      { key: "regHouse", label: "19. Прописка: дом" },
      { key: "regFlat", label: "19. Прописка: квартира" },
      { key: "regPostcode", label: "19. Прописка: индекс" },
      { key: "actualDiffers", label: "19. Фактический адрес", type: "select", options: () => ACTUAL_ADDRESS, wide: true },
      { key: "actualCountry", label: "19. Фактический адрес: страна" },
      { key: "actualCity", label: "19. Фактический адрес: город" },
      { key: "actualStreet", label: "19. Фактический адрес: улица", wide: true },
      { key: "actualHouse", label: "19. Фактический адрес: дом" },
      { key: "actualFlat", label: "19. Фактический адрес: квартира" },
      { key: "actualPostcode", label: "19. Фактический адрес: индекс" },
      { key: "email", label: "19. E-mail", type: "email" },
      { key: "phone", label: "19. Телефон", type: "tel" },
      { key: "residesElsewhere", label: "20. Живёте не в стране гражданства", type: "select" },
    ],
  },
  {
    title: "Работа или учёба",
    description: "Пункты 21–22. Что спрашивать дальше, зависит от статуса.",
    fields: [
      { key: "employment", label: "21. Статус занятости", type: "select", options: () => EMPLOYMENT, hint: "profession" },
      { key: "position", label: "21. Должность" },
      {
        key: "employerName",
        label: (v) => (v.employment === "pupil" || v.employment === "student" ? "22. Учебное заведение" : "22. Место работы"),
        wide: true,
      },
      { key: "employerAddress", label: "22. Адрес", wide: true },
      { key: "employerPhone", label: "22. Телефон", type: "tel" },
      { key: "employerEmail", label: "22. E-mail (в анкету не печатается)", type: "email" },
    ],
  },
  {
    title: "Поездка",
    description: "Этих данных нет в документе.",
    fields: [
      { key: "purpose", label: "23. Цель поездки", type: "select" },
      { key: "destination", label: "25. Страна назначения" },
      { key: "firstEntry", label: "26. Страна первого въезда", type: "select", options: () => SCHENGEN, hint: "firstEntry" },
      { key: "entries", label: "27. Количество въездов", type: "select" },
      { key: "arrivalDate", label: "28. Дата въезда", type: "date" },
      { key: "departureDate", label: "28. Дата выезда", type: "date" },
      { key: "fingerprints", label: "29. Сдавали отпечатки для шенгенской визы", type: "select" },
    ],
  },
  {
    title: "Приглашающая сторона",
    description: "Пункты 31–32. Необязательные поля: частное лицо или гостиница, и организация.",
    fields: [
      { key: "hostKind", label: "31. Кто приглашает", type: "select", options: () => HOST_KIND, wide: true },
      { key: "hostSurname", label: "31. Фамилия" },
      { key: "hostFirstName", label: "31. Имя" },
      { key: "hotelName", label: "31. Название гостиницы" },
      { key: "hostAddress1", label: "31. Адрес", wide: true },
      { key: "hostAddress2", label: "31. Адрес, продолжение", wide: true },
      { key: "hostPhone", label: "31. Телефон", type: "tel" },
      { key: "hostEmail", label: "31. E-mail", type: "email" },
      { key: "orgName", label: "32. Организация", wide: true },
      { key: "orgAddress", label: "32. Адрес организации", wide: true },
      { key: "orgContactSurname", label: "32. Фамилия контактного лица" },
      { key: "orgContactFirstName", label: "32. Имя контактного лица" },
      { key: "orgPhone", label: "32. Телефон", type: "tel" },
      { key: "orgEmail", label: "32. E-mail контактного лица", type: "email" },
    ],
  },
  {
    title: "Расходы и подача",
    description: "Пункт 33, город и дата подачи. Этих данных нет в документе.",
    fields: [
      { key: "payer", label: "33. Расходы оплачивает", type: "select" },
      { key: "sponsorWho", label: "33. Кто спонсор" },
      { key: "means", label: "33. Средства", type: "means", wide: true },
      {
        key: "submissionCity",
        label: "Город подачи",
        type: "select",
        options: (t) => Object.fromEntries(CITIES[t.country].map((c) => [c.id, c.ru])),
        hint: "place",
      },
      { key: "submissionDate", label: "Дата подачи", type: "date" },
    ],
  },
]

type Props = {
  values: Values
  sources: Sources
  errors: Errors
  template: Template
  onChange: (key: keyof Values, value: string | string[]) => void
  onTemplate: (t: Template) => void
}

export function AnketaForm({ values, sources, errors, template, onChange, onTemplate }: Props) {
  const scanned = Object.keys(sources).length > 0
  const printed = printedText(values, template)
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Анкета</CardTitle>
          <CardDescription>От страны подачи зависят бланк, названия на нём и список городов.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="field-template">Страна подачи</Label>
            <ChoiceSelect
              id="field-template"
              value={template.country}
              options={Object.fromEntries(TEMPLATES.map((t) => [t.country, t.label]))}
              onChange={(c) => {
                const next = TEMPLATES.find((t) => t.country === c)
                if (next) onTemplate(next)
              }}
            />
          </div>
        </CardContent>
      </Card>
      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <CardHeader>
            <CardTitle>{s.title}</CardTitle>
            <CardDescription>{s.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {s.fields
              .filter((f) => visible(f.key, values))
              .map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  values={values}
                  template={template}
                  printed={printed}
                  error={errors[f.key]}
                  badge={s.fromDoc && scanned ? <SourceBadge source={sources[f.key]} /> : null}
                  onChange={onChange}
                />
              ))}
          </CardContent>
        </Card>
      ))}
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
  template,
  printed,
  error,
  badge,
  onChange,
}: {
  field: Field
  values: Values
  template: Template
  printed: Partial<Record<PrintKey, string>>
  error?: string
  badge: ReactNode
  onChange: Props["onChange"]
}) {
  const id = `field-${f.key}`
  const label = typeof f.label === "function" ? f.label(values) : f.label
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
        options={f.options ? f.options(template) : OPTIONS[f.key as ChoiceKey]}
        invalid={!!error}
        describedBy={describedBy}
        onChange={(v) => onChange(f.key, v)}
      />
    )
  } else if (f.type === "means") {
    const options: Record<string, string> = MEANS[values.payer as keyof typeof MEANS] ?? {}
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
            {label}
          </span>
        ) : (
          <Label htmlFor={id}>{label}</Label>
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
