import { useRef, useState } from "react"
import { CircleAlert, LoaderCircle, ScanLine } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  photo: string | null
  busy: string | null
  error: string | null
  onFile: (file: File) => void
}

export function Dropzone({ photo, busy, error, onFile }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (file?.type.startsWith("image/")) onFile(file)
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
          "relative flex min-h-80 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl bg-tile p-6 text-center transition-colors duration-300 hover:bg-tile-hover",
          "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring",
          over && "bg-tile-hover",
        )}
      >
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = ""
          }}
        />
        {photo ? (
          <img src={photo} alt="Загруженный документ" className="max-h-[70vh] w-full rounded-xl object-contain" />
        ) : (
          <>
            <ScanLine className="size-10" strokeWidth={1.5} aria-hidden />
            <p className="font-medium">Перетащите фото паспорта или ID-карты</p>
            <p className="text-sm">или нажмите, чтобы выбрать файл: JPG, PNG, WebP</p>
          </>
        )}
        {busy && (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm font-medium backdrop-blur-sm">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {busy}
          </div>
        )}
      </label>
      {photo && (
        <Button variant="outline" className="self-start" onClick={() => input.current?.click()} disabled={!!busy}>
          Заменить фото
        </Button>
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
