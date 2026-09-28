import { useState, type ComponentProps } from "react"
import { CalendarIcon } from "lucide-react"
import { ru } from "react-day-picker/locale"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { dmyToIso, isoDate, maskDmy, toDmy } from "@/lib/anketa"

type Props = Omit<ComponentProps<"input">, "value" | "onChange"> & { value: string; onChange: (iso: string) => void }

// The native date input shows the browser's format (mm/dd/yyyy in an English Chrome) and a white picker, neither of
// which a page can change: typed dd.mm.yyyy plus a calendar in the app's own style instead. The value stays ISO.
export function DateField({ value, onChange, ...props }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [prev, setPrev] = useState(value)
  const [open, setOpen] = useState(false)
  // A scan or a calendar pick replaces a half-typed date.
  if (value !== prev) {
    setPrev(value)
    if (value) setDraft(null)
  }
  const selected = value ? new Date(`${value}T00:00:00`) : undefined

  return (
    <div className="relative">
      <Input
        {...props}
        className="pr-10"
        inputMode="numeric"
        autoComplete="off"
        placeholder="ДД.ММ.ГГГГ"
        value={draft ?? toDmy(value, ".")}
        // A full-length date that doesn't exist (31.02) shows red at once instead of waiting for submit.
        aria-invalid={props["aria-invalid"] || draft?.length === 10}
        onChange={(e) => {
          const text = maskDmy(e.target.value)
          const iso = dmyToIso(text)
          setDraft(iso ? null : text)
          if (iso !== value) onChange(iso)
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Выбрать в календаре" className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground">
            <CalendarIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            // 40 px days: shadcn's 28 px default is too small a target for a finger.
            className="[--cell-size:--spacing(10)]"
            mode="single"
            locale={ru}
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected}
            startMonth={new Date(1900, 0)}
            endMonth={new Date(new Date().getFullYear() + 30, 11)}
            autoFocus
            onSelect={(d) => {
              if (d) onChange(isoDate(d))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
