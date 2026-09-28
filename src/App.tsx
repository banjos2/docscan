import { useEffect, useMemo, useState } from "react"
import { Download, FileCheck2, TriangleAlert } from "lucide-react"
import { AnketaForm } from "@/components/AnketaForm"
import { Dropzone } from "@/components/Dropzone"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { emptyValues, type Sources, type Values } from "@/lib/anketa"
import { extract, MrzNotFoundError } from "@/lib/mrz"
import { preloadOcr, recognize } from "@/lib/ocr"
import { fillAnketa } from "@/lib/pdf"
import { validate } from "@/lib/validate"

export function App() {
  const [values, setValues] = useState<Values>(() => emptyValues())
  const [sources, setSources] = useState<Sources>({})
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [pdf, setPdf] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const { errors, warnings } = useMemo(() => validate(values), [values])
  const hasErrors = Object.keys(errors).length > 0

  useEffect(() => preloadOcr(), [])

  const replacePdf = (url: string | null) =>
    setPdf((old) => {
      if (old) URL.revokeObjectURL(old)
      return url
    })

  async function scan(file: File) {
    if (busy) return
    setPhoto((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })
    setOcrError(null)
    setBusy("Загружаю модель распознавания…")
    try {
      const rows = await recognize(file, () => setBusy("Распознаю документ…"))
      const found = extract(rows)
      setValues((v) => ({ ...v, ...found.values }))
      setSources(found.sources)
      replacePdf(null)
      setPdfError(null)
    } catch (e) {
      console.error(e)
      setOcrError(
        e instanceof MrzNotFoundError
          ? e.message
          : "Распознавание не запустилось. Проверьте интернет для первой загрузки модели или заполните поля вручную.",
      )
    } finally {
      setBusy(null)
    }
  }

  function change(key: keyof Values, value: string | string[]) {
    setValues((v) => ({ ...v, [key]: value, ...(key === "payer" ? { means: [] } : {}) }))
    setSources((s) => (key in s ? { ...s, [key]: "manual" } : s))
    replacePdf(null)
    setPdfError(null)
  }

  async function approve() {
    setSubmitted(true)
    setPdfError(null)
    if (hasErrors) return
    setGenerating(true)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}anketa-template.pdf`)
      if (!res.ok) throw new Error(`Не удалось загрузить шаблон анкеты: ${res.status}`)
      const bytes = await fillAnketa(await res.arrayBuffer(), values)
      replacePdf(URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })))
    } catch (e) {
      console.error(e)
      setPdfError("Не получилось сформировать PDF. Обновите страницу и попробуйте ещё раз.")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[1400px] flex-col gap-8 px-4 py-8 sm:px-6 md:px-8 md:py-12">
      <header className="flex flex-col gap-2">
        <p className="font-display text-sm font-bold tracking-wider text-flame-ink uppercase">Шенгенская анкета</p>
        <h1 className="font-display text-3xl font-bold tracking-tight uppercase">DocScan</h1>
        <p className="max-w-prose text-muted-foreground">
          Загрузите фото паспорта или ID-карты: данные из MRZ попадут в анкету. Проверьте их, дополните и скачайте готовый
          PDF. Фото обрабатывается в браузере и никуда не отправляется.
        </p>
      </header>
      <main className="grid items-start gap-8 lg:grid-cols-2">
        <section aria-label="Документ" className="flex flex-col gap-4 lg:sticky lg:top-8">
          <Dropzone photo={photo} busy={busy} error={ocrError} onFile={scan} />
        </section>
        <section aria-label="Анкета" className="flex flex-col gap-6">
          <AnketaForm values={values} sources={sources} errors={submitted ? errors : {}} onChange={change} />
          {warnings.length > 0 && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Проверьте перед подачей</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={approve} disabled={generating}>
              <FileCheck2 />
              Одобрить и сформировать PDF
            </Button>
            {submitted && hasErrors && <p className="text-sm text-destructive">Заполните поля, отмеченные выше.</p>}
            {pdfError && <p className="text-sm text-destructive">{pdfError}</p>}
          </div>
          {pdf && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Готовая анкета</CardTitle>
                <Button asChild>
                  <a href={pdf} download={`anketa-${values.surname || "schengen"}.pdf`}>
                    <Download />
                    Скачать PDF
                  </a>
                </Button>
              </CardHeader>
              <CardContent>
                <iframe src={pdf} title="Предпросмотр анкеты" className="h-[80vh] w-full rounded-lg border" />
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
