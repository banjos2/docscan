import { useRef, useState } from "react"
import { CircleAlert, LoaderCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { isHeic } from "@/lib/heic"
import { isPdf } from "@/lib/pdf"
import { cn } from "@/lib/utils"

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const UNSUPPORTED_FORMAT_MESSAGE = "Поддерживаются JPG, PNG, WebP, HEIC и PDF. Сохраните фото в одном из этих форматов."

type Props = {
  photo: string | null
  busy: string | null
  error: string | null
  onFile: (file: File) => void
}

export function Dropzone({ photo, busy, error, onFile }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [formatError, setFormatError] = useState<string | null>(null)
  const pick = (files: FileList | null) => {
    if (busy) return
    const file = files?.[0]
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type) && !isHeic(file) && !isPdf(file)) {
      setFormatError(UNSUPPORTED_FORMAT_MESSAGE)
      return
    }
    setFormatError(null)
    onFile(file)
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          pick(e.dataTransfer.files)
        }}
        className={cn(
          "relative flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl bg-tile p-6 text-center sm:min-h-64 transition-colors duration-300 hover:bg-tile-hover",
          "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring",
          over && "bg-tile-hover",
        )}
      >
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf,.pdf"
          className="sr-only"
          disabled={!!busy}
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = ""
          }}
        />
        {photo ? (
          <img src={photo} alt="Загруженный документ" className="max-h-[60vh] w-full rounded-xl object-contain" />
        ) : (
          <>
            <PassportPage />
            {/* A finger can't drag a file: touch screens get the camera and the gallery instead. */}
            <p className="font-medium pointer-coarse:hidden">Перетащите фото или скан паспорта или ID‑карты</p>
            <p className="text-sm pointer-coarse:hidden">или нажмите, чтобы выбрать файл: JPG, PNG, WebP, HEIC, PDF</p>
            <p className="hidden font-medium pointer-coarse:block">Сфотографируйте паспорт или ID‑карту</p>
            <p className="hidden text-sm pointer-coarse:block">или выберите фото или PDF‑скан: JPG, PNG, WebP, HEIC, PDF</p>
          </>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm font-medium backdrop-blur-sm">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {busy}
          </div>
        )}
      </label>
      <div role="status" aria-live="polite" className="sr-only">
        {busy ?? ""}
      </div>
      {photo && (
        <Button variant="outline" className="self-start" onClick={() => input.current?.click()} disabled={!!busy}>
          Заменить фото
        </Button>
      )}
      {formatError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Не удалось загрузить файл</AlertTitle>
          <AlertDescription>{formatError}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Не удалось распознать документ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// What to photograph: a passport's data page, its two machine-readable lines lit. The lines are ICAO 9303's
// specimen (the fictional Utopia), clipped with a fade where the page ends.
function PassportPage() {
  return (
    <div aria-hidden className="w-full max-w-72 rounded-xl border border-foreground/10 bg-background p-3 text-left shadow-sm">
      <div className="flex gap-3">
        <div className="h-16 w-12 shrink-0 rounded-md bg-foreground/5" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <div className="h-1.5 w-1/2 rounded-full bg-foreground/10" />
          <div className="h-1.5 w-3/4 rounded-full bg-foreground/10" />
          <div className="h-1.5 w-2/3 rounded-full bg-foreground/10" />
          <div className="h-1.5 w-1/3 rounded-full bg-foreground/10" />
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-md bg-flame/10 px-2 py-1.5 font-mono text-xs leading-4 tracking-wide whitespace-nowrap text-flame-ink mask-r-from-80%">
        <div>{"P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<"}</div>
        <div>{"L898902C36UTO7408122F1204159ZE184226B<<<<<10"}</div>
      </div>
    </div>
  )
}
