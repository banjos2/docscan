import type { ReactNode } from "react"
import { DateField } from "@/components/DateField"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MEANS, OPTIONS, type ChoiceKey, type Source, type Sources, type Values } from "@/lib/anketa"
import { cn } from "@/lib/utils"
import type { Errors } from "@/lib/validate"

type Field = {
  key: keyof Values
  label: string
  type?: "text" | "date" | "email" | "tel" | "select" | "means"
  wide?: boolean
  show?: (v: Values) => boolean
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
    title: "Поездка и контакты",
    description: "Этих данных нет в документе.",
    fields: [
      { key: "address1", label: "19. Адрес", wide: true },
      { key: "address2", label: "19. Адрес, продолжение", wide: true },
      { key: "email", label: "19. E-mail", type: "email" },
      { key: "phone", label: "19. Телефон", type: "tel" },
      { key: "residesElsewhere", label: "20. Живёте не в стране гражданства", type: "select" },
      { key: "profession", label: "21. Профессия" },
      { key: "purpose", label: "23. Цель поездки", type: "select" },
      { key: "destination", label: "25. Страна назначения" },
      { key: "firstEntry", label: "26. Страна первого въезда" },
      { key: "entries", label: "27. Количество въездов", type: "select" },
      { key: "arrivalDate", label: "28. Дата въезда", type: "date" },
      { key: "departureDate", label: "28. Дата выезда", type: "date" },
      { key: "fingerprints", label: "29. Сдавали отпечатки для шенгенской визы", type: "select" },
      { key: "host", label: "31. Приглашающий или отель", wide: true },
      { key: "hostAddress1", label: "31. Адрес", wide: true },
      { key: "hostAddress2", label: "31. Адрес, продолжение", wide: true },
      { key: "hostPhone", label: "31. Телефон", type: "tel" },
      { key: "payer", label: "33. Расходы оплачивает", type: "select" },
      { key: "sponsorWho", label: "33. Кто спонсор", show: (v) => v.payer === "sponsor" },
      { key: "means", label: "33. Средства", type: "means", wide: true },
      { key: "place", label: "Место заполнения" },
      { key: "signDate", label: "Дата заполнения", type: "date" },
    ],
  },
]

type Props = {
  values: Values
  sources: Sources
  errors: Errors
  onChange: (key: keyof Values, value: string | string[]) => void
}

export function AnketaForm({ values, sources, errors, onChange }: Props) {
  const scanned = Object.keys(sources).length > 0
  return (
    <>
      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <CardHeader>
            <CardTitle>{s.title}</CardTitle>
            <CardDescription>{s.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {s.fields
              .filter((f) => f.show?.(values) ?? true)
              .map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  values={values}
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

function FieldRow({
  field: f,
  values,
  error,
  badge,
  onChange,
}: {
  field: Field
  values: Values
  error?: string
  badge: ReactNode
  onChange: Props["onChange"]
}) {
  const id = `field-${f.key}`
  const errorId = error ? `${id}-error` : undefined
  let control: ReactNode
  if (f.type === "select") {
    control = (
      <Select value={values[f.key] as string} onValueChange={(v) => onChange(f.key, v)}>
        <SelectTrigger id={id} className="w-full" aria-invalid={!!error} aria-describedby={errorId}>
          <SelectValue placeholder="Выберите" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(OPTIONS[f.key as ChoiceKey]).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        aria-describedby={errorId}
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
        aria-describedby={errorId}
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
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
