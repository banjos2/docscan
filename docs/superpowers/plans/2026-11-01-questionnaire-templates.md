# Опросный лист, шаблоны анкет, место и дата подачи — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Испанский бланк получает поля опросного листа (пп. 19, 21–22), приглашающую сторону (пп. 31–32), значения по умолчанию (пп. 26–27) и место/дату подачи, а всё, что зависит от бланка, переезжает в шаблон анкеты, к которому потом добавятся другие страны.

**Architecture:** Данные заявителя (`Values`, `src/lib/anketa.ts`) не знают про бланк: выборы хранятся кодами. Шаблон (`src/lib/template.ts` + `src/lib/templates/es.ts`) хранит PDF, координаты, формат даты и названия на языке бланка. Чистая функция `printedText(v, t)` (`src/lib/print.ts`) решает, какой текст попадает в каждую клетку бланка; `fillAnketa` только рисует его. Правило «поле скрыто — не печатается и не проверяется» живёт в одной функции `visible()`.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Tailwind v4, shadcn/ui, pdf-lib, vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-questionnaire-templates-design.md`

## Global Constraints

- Всё работает в браузере, бэкенда нет; данные клиента не покидают устройство.
- PDF: Helvetica (WinAnsi). Каждое новое текстовое поле проходит проверку латиницы с сообщением «Анкета заполняется латиницей».
- В PDF всё ЗАГЛАВНЫМИ, кроме e-mail; длинное значение сжимается под ширину клетки (как сейчас, минимум 5 pt).
- На языке шаблона печатаются только выборы из списков: п. 26, статус в п. 21, город подачи. Страны из паспорта (пп. 6, 7, 16) и введённое вручную — как есть.
- Обязательные поля не меняются: пп. 1, 3, 4, 7, 13, 15.
- Скрытое поле не печатается и не проверяется.
- Новая страна = новый файл шаблона + её список городов; остальной код про Испанию не знает.
- Интерфейс на русском: с заглавной только первое слово, без эмодзи.
- Тестовые данные — немецкий образец паспорта (Erika Mustermann) и вымышленные адреса; реальных данных в репозитории нет.
- Даты внутри приложения — ISO `ГГГГ-ММ-ДД`; на бланке — `t.formatDate(iso)`.
- Каждая задача заканчивается коммитом; сообщение: зачем, что изменено, чем доказано.

## Review Focus

1. Специалист сменил статус с «работает» (должность введена) на «студент» — в п. 21 печатается `ESTUDIANTE`, а не старая должность. Тест — Task 3.
2. В скрытом поле осталась кириллица (место работы, потом статус «пенсионер») — PDF формируется. Тест — Task 3.
3. Адрес заполнен частично (только город и страна; дом без квартиры) — строки без лишних запятых и дефисов. Тест — Task 3.
4. Код города, которого нет в списке страны шаблона, — место подачи не печатается, а не печатается чужой город. Тест — Task 2.
5. Недописанная дата подачи («20.11.20») — PDF не формируется, у поля ошибка. Тест — Task 2.

## File Structure

| Файл | Ответственность |
|---|---|
| `src/lib/anketa.ts` | Данные заявителя: ключи, варианты выбора с русскими подписями, значения по умолчанию, `visible()` |
| `src/lib/cities.ts` | Список городов подачи по странам — файл настроек |
| `src/lib/template.ts` | Тип `Template`, ключи клеток бланка `PRINT_KEYS`, реестр `TEMPLATES` |
| `src/lib/templates/es.ts` | Испанский шаблон: бланк, координаты (бывший `layout.ts`), формат даты, испанские названия |
| `src/lib/print.ts` | `printedText(v, t)`: текст для каждой клетки бланка |
| `src/lib/pdf.ts` | `fillAnketa(pdfBytes, v, t)`: рисует `printedText` и галочки |
| `src/lib/validate.ts` | Проверки; пропускает скрытые поля |
| `src/lib/specimen.ts` | Тестовый заявитель (Erika Mustermann) для `print.test.ts` и `pdf.test.ts` |
| `src/components/AnketaForm.tsx` | Форма: секции, выборы, подсказки «в анкете: …» |
| `src/App.tsx` | Состояние: данные, выбранный шаблон |
| `scripts/render-pdf-page.js` | Рендер страниц PDF в PNG (macOS PDFKit) для проверки координат глазами |
| `src/lib/layout.ts` | Удаляется (переезжает в `templates/es.ts`) |

---

### Task 1: Шаблон анкеты без изменения поведения

**Files:**
- Create: `src/lib/template.ts`, `src/lib/templates/es.ts`, `src/lib/print.ts`, `src/lib/print.test.ts`, `src/lib/specimen.ts`, `scripts/render-pdf-page.js`
- Modify: `src/lib/pdf.ts`, `src/lib/pdf.test.ts`, `src/App.tsx`
- Delete: `src/lib/layout.ts`

**Interfaces:**
- Produces:
  - `template.ts`: `type Pos = { page: number; x: number; y: number }`, `type TextPos = Pos & { size: number; maxWidth: number }`, `PRINT_KEYS` (as const), `type PrintKey`, `type Template = { country: "ES"; label: string; pdf: string; formatDate: (iso: string) => string; text: Record<PrintKey, TextPos>; boxes: { [K in ChoiceKey]: Record<keyof (typeof OPTIONS)[K], Pos> }; sponsorOther: Pos; meansBoxes: { [K in keyof typeof MEANS]: Record<keyof (typeof MEANS)[K], Pos> } }`, `TEMPLATES: Template[]` (= `[ES]`). Поле `country` расширяется в Task 2.
  - `templates/es.ts`: `ES: Template` (`import type` из `../template`, чтобы не было цикла).
  - `print.ts`: `printedText(v: Values, t: Template): Partial<Record<PrintKey, string>>` — только непустые значения.
  - `pdf.ts`: `fillAnketa(pdfBytes: ArrayBuffer | Uint8Array, v: Values, t: Template): Promise<Uint8Array>`.
  - `specimen.ts`: `SPECIMEN: Values` (переезжает из `pdf.test.ts` без изменений).

- [ ] **Step 1: Перенести тестового заявителя**

`specimen` из `src/lib/pdf.test.ts` → `export const SPECIMEN: Values` в `src/lib/specimen.ts`; `pdf.test.ts` импортирует его. `npm test` — 23 passed.

- [ ] **Step 2: Тест на `printedText`**

`src/lib/print.test.ts`:

```ts
test("printedText puts on paper what the form holds: capitals except e-mail, dates as the template prints them", () => {
  expect(printedText(SPECIMEN, ES)).toMatchObject({
    surname: "MUSTERMANN", firstName: "ERIKA", birthDate: "12-08-1964", issuedBy: "GERMANY",
    address2: "51147 KOELN, GERMANY", email: "erika@example.com", sponsorWho: "MOTHER", place: "KOELN", date: "28-09-2026",
  })
})

test("printedText leaves out empty values and the sponsor when the applicant pays", () => {
  const p = printedText({ ...SPECIMEN, payer: "self", nationalId: "  " }, ES)
  expect(p).not.toHaveProperty("sponsorWho")
  expect(p).not.toHaveProperty("nationalId")
})
```

- [ ] **Step 3: Запустить — FAIL** (`Cannot find module './print'`): `npx vitest run src/lib/print.test.ts`

- [ ] **Step 4: Шаблон и `printedText`**

- `PRINT_KEYS` — свой литеральный список (не выводится из `TEXT_KEYS`: дальше они расходятся): текущие `TEXT_KEYS` в том же порядке, но `signDate` → `date` (клетка «Lugar y fecha»).
- `ES`: `country: "ES"`, `label: "Испания"`, `pdf: "anketa-template.pdf"`, `formatDate: (iso) => toDmy(iso)`, `text` = `TEXT` из `layout.ts` (ключ `signDate` → `date`), `boxes` = `BOXES`, `sponsorOther` = `SPONSOR_OTHER`, `meansBoxes` = `MEANS_BOXES`. Координаты копируются без изменений.
- `printedText`: значение клетки `k` — `v[k]` (для `date` — `v.signDate`), обрезанное; даты из `DATE_KEYS` через `t.formatDate`; ЗАГЛАВНЫМИ, кроме `email`; `sponsorWho` только при `payer === "sponsor"`; пустые не попадают в результат.

- [ ] **Step 5: `fillAnketa` рисует `printedText`**

Цикл по `Object.entries(printedText(v, t))` с той же формулой сжатия; галочки — из `t.boxes`, `t.sponsorOther`, `t.meansBoxes`. `layout.ts` удалить. `App.tsx`: `const template = TEMPLATES[0]` (в Task 2 станет состоянием), `fetch(\`${import.meta.env.BASE_URL}${template.pdf}\`)`, `fillAnketa(bytes, values, template)`. `pdf.test.ts` передаёт `ES`.

- [ ] **Step 6: Всё зелёное:** `npm test && npx tsc -b && npx eslint .` — 25 passed, без ошибок.

- [ ] **Step 7: Рычаг для проверки координат — `scripts/render-pdf-page.js`**

```js
// Renders PDF pages to PNG for checking where values land (macOS PDFKit, no installs).
// osascript -l JavaScript scripts/render-pdf-page.js <file.pdf> <outdir> <page index>...
function run(argv) {
  ObjC.import("PDFKit"); ObjC.import("AppKit")
  const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]))
  return argv.slice(2).map(Number).map((i) => {
    const page = d.pageAtIndex(i)
    const { size } = page.boundsForBox(0)
    const img = page.thumbnailOfSizeForBox($.NSMakeSize(size.width * 2, size.height * 2), 0)
    const png = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation).representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $())
    const out = `${argv[1]}/page${i}.png`
    png.writeToFileAtomically(out, true)
    return out
  }).join("\n")
}
```

Проверка: `PDF_OUT=$SCRATCH/t1.pdf npx vitest run src/lib/pdf.test.ts && osascript -l JavaScript scripts/render-pdf-page.js $SCRATCH/t1.pdf $SCRATCH 0 1 2 3` (`$SCRATCH` — скретчпад сессии). На всех четырёх страницах значения стоят там же, где до задачи.

- [ ] **Step 8: Коммит** `refactor: form template holds the blank, positions and date format; printedText decides what goes on paper`

---

### Task 2: Место и дата подачи, значения по умолчанию, страна подачи

**Files:**
- Create: `src/lib/cities.ts`
- Modify: `src/lib/anketa.ts`, `src/lib/template.ts`, `src/lib/templates/es.ts`, `src/lib/print.ts`, `src/lib/print.test.ts`, `src/lib/mrz.test.ts`, `src/lib/specimen.ts`, `src/components/AnketaForm.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `Template`, `printedText`, `ES` (Task 1).
- Produces:
  - `cities.ts`: `type CountryCode = "PL" | "GR" | "ES" | "HU" | "IT"`, `type City = { id: string; ru: string; print: string }`, `CITIES: Record<CountryCode, City[]>`.
  - `anketa.ts`: `SCHENGEN` (код → русское название), `type SchengenCode`, `type SelectKey = "firstEntry" | "submissionCity"` (расширяется в Task 3–4), `Values = Record<TextKey | ChoiceKey | SelectKey, string> & { means: string[] }`, `emptyValues(): Values` — без параметра.
  - `Template`: `country: CountryCode`, `schengen: Record<SchengenCode, string>`.
  - `AnketaForm` props: `+ template: Template`, `+ onTemplate: (t: Template) => void`. `Field`: `+ options?: (t: Template) => Record<string, string>` (по умолчанию `OPTIONS[key]`), `+ hint?: PrintKey` (подпись «в анкете: {printed[hint]}» под полем, если значение непустое).

Данные (печатаемые названия — ЗАГЛАВНЫМИ, Latin-1):

| Код | `SCHENGEN` | `ES.schengen` | Код | `SCHENGEN` | `ES.schengen` |
|---|---|---|---|---|---|
| AT | Австрия | AUSTRIA | LV | Латвия | LETONIA |
| BE | Бельгия | BÉLGICA | LT | Литва | LITUANIA |
| BG | Болгария | BULGARIA | LI | Лихтенштейн | LIECHTENSTEIN |
| HU | Венгрия | HUNGRÍA | LU | Люксембург | LUXEMBURGO |
| DE | Германия | ALEMANIA | MT | Мальта | MALTA |
| GR | Греция | GRECIA | NL | Нидерланды | PAÍSES BAJOS |
| DK | Дания | DINAMARCA | NO | Норвегия | NORUEGA |
| IS | Исландия | ISLANDIA | PL | Польша | POLONIA |
| ES | Испания | ESPAÑA | PT | Португалия | PORTUGAL |
| IT | Италия | ITALIA | RO | Румыния | RUMANÍA |
| SK | Словакия | ESLOVAQUIA | SI | Словения | ESLOVENIA |
| FI | Финляндия | FINLANDIA | FR | Франция | FRANCIA |
| HR | Хорватия | CROACIA | CZ | Чехия | CHEQUIA |
| CH | Швейцария | SUIZA | SE | Швеция | SUECIA |
| EE | Эстония | ESTONIA | | | |

`SCHENGEN` в порядке русского алфавита (Австрия … Эстония), как в списке выбора.

`CITIES` (порядок из ТЗ; `print` для стран без шаблона — латиницей, сверить с языком бланка, когда он появится):

| id | ru | print |
|---|---|---|
| brest | Брест | BREST |
| pinsk | Пинск | PINSK |
| baranovichi | Барановичи | BARANOVICHI |
| grodno | Гродно | GRODNO |
| lida | Лида | LIDA |
| minsk | Минск | MINSK |
| gomel | Гомель | GOMEL |
| mogilev | Могилёв | MOGILEV |
| vitebsk | Витебск | VITEBSK |
| moscow | Москва | MOSCÚ (только в списке ES) |

PL и HU: brest, pinsk, baranovichi, grodno, lida, minsk, gomel, mogilev, vitebsk. GR: brest, grodno, vitebsk, minsk. ES: minsk, moscow. IT: minsk, brest, gomel, grodno, vitebsk.

- [ ] **Step 1: Тесты**

`print.test.ts`:

```ts
test("a new anketa defaults to first entry in Poland and multiple entries, with no submission place or date", () => {
  expect(emptyValues()).toMatchObject({ firstEntry: "PL", entries: "multiple", submissionCity: "", submissionDate: "" })
})

test("printedText writes list choices in the template's language", () => {
  const p = printedText({ ...SPECIMEN, firstEntry: "PL", submissionCity: "moscow", submissionDate: "2026-11-20" }, ES)
  expect(p).toMatchObject({ firstEntry: "POLONIA", place: "MOSCÚ", date: "20-11-2026" })
})

test("printedText prints no city that the template's country doesn't list", () => {
  expect(printedText({ ...SPECIMEN, submissionCity: "pinsk" }, ES)).not.toHaveProperty("place")
})

test("every Schengen state has a name in the template and every printed name fits the PDF font", () => {
  expect(Object.keys(ES.schengen).sort()).toEqual(Object.keys(SCHENGEN).sort())
  const printed = [...Object.values(ES.schengen), ...Object.values(CITIES).flat().map((c) => c.print)]
  for (const s of printed) expect(s).toMatch(/^[\x20-\x7E\xA0-\xFF]+$/)
})
```

`mrz.test.ts`, рядом с тестами `validate`:

```ts
test("validate stops the PDF on an unfinished submission date", () => {
  expect(validate({ ...emptyValues(), submissionDate: "20.11.20" }, TODAY).errors.submissionDate).toBe("Проверьте дату: ДД.ММ.ГГГГ")
})
```

- [ ] **Step 2: Запустить — FAIL** (нет `SCHENGEN`, `CITIES`, `submissionCity`): `npm test`

- [ ] **Step 3: Данные заявителя**

`anketa.ts`: из `TEXT_KEYS` убрать `firstEntry`, `place`, `signDate`, добавить `submissionDate`; в `DATE_KEYS` `signDate` → `submissionDate`; `SelectKey` и `SCHENGEN` по таблице; `emptyValues()` без параметра: `entries: "multiple"`, `firstEntry: "PL"`, `submissionCity: ""`; подпись даты по умолчанию (сегодня) убрать. Вызовы `emptyValues(TODAY)` / `emptyValues(new Date(...))` в тестах и `App.tsx` → `emptyValues()`. `SPECIMEN`: `firstEntry: "ES"`, `submissionCity: "minsk"`, `submissionDate: "2026-10-15"` вместо `place`/старого `firstEntry`; в первом тесте `print.test.ts` ожидания `place: "MINSK"`, `date: "15-10-2026"`.

- [ ] **Step 4: Шаблон и печать**

`cities.ts` по таблице. `Template.country: CountryCode`, `Template.schengen`; `ES.schengen` по таблице. `printedText`: `firstEntry` ← `t.schengen[v.firstEntry]`; `place` ← `print` города с `id === v.submissionCity` из `CITIES[t.country]`; `date` ← `v.submissionDate`.

- [ ] **Step 5: Запустить — PASS:** `npm test && npx tsc -b && npx eslint .`

- [ ] **Step 6: Форма и выбор страны**

- `App.tsx`: `const [template, setTemplate] = useState(TEMPLATES[0])`; при смене шаблона `submissionCity` сбрасывается в `""`.
- `AnketaForm`: первая карточка «Анкета» с выбором «Страна подачи» из `TEMPLATES` (подписи `t.label`). Поле «26. Страна первого въезда» — выбор из `SCHENGEN`, `hint: "firstEntry"`. Последняя секция: вместо «Место заполнения»/«Дата заполнения» — «Город подачи» (выбор из `CITIES[template.country]`, подписи `ru`, `hint: "place"`) и «Дата подачи» (`type: "date"`). `const printed = printedText(values, template)` считается один раз на рендер.

- [ ] **Step 7: Проверить в браузере и на бланке**

Dev-сервер (`preview_start` «docscan»): у п. 26 подпись «в анкете: POLONIA», у п. 27 выбран «Многократный»; выбор «Москва» → «в анкете: MOSCÚ»; недописанная дата подачи после «Одобрить» даёт ошибку у поля. `PDF_OUT` + `render-pdf-page.js` страницы 1 и 3: `POLONIA` в п. 26, город и дата подачи в клетке «Lugar y fecha».

- [ ] **Step 8: Коммит** `feat: submission city and date, Poland and multiple entries by default, submission country from templates`

---

### Task 3: Адрес, занятость, место работы или учёбы (пп. 19, 21, 22)

**Files:**
- Modify: `src/lib/anketa.ts`, `src/lib/template.ts`, `src/lib/templates/es.ts`, `src/lib/print.ts`, `src/lib/print.test.ts`, `src/lib/validate.ts`, `src/lib/mrz.test.ts`, `src/lib/specimen.ts`, `src/components/AnketaForm.tsx`

**Interfaces:**
- Consumes: `SelectKey`, `Template`, `printedText`, `Field.hint` (Task 2).
- Produces:
  - `anketa.ts`: `EMPLOYMENT` (код → русская подпись), `type EmploymentCode`, `ACTUAL_ADDRESS = { no: "Совпадает с пропиской", yes: "Другой" }`, `SelectKey += "employment" | "actualDiffers"`, `visible(key: keyof Values, v: Values): boolean`.
  - `print.ts`: `type Address = Record<"country" | "city" | "street" | "house" | "flat" | "postcode", string>`, `addressLines(a: Address): [string, string]`.
  - `Template.employment: Record<EmploymentCode, string>`; `PRINT_KEYS += "employer"`.

Данные:

| Код | `EMPLOYMENT` | `ES.employment` |
|---|---|---|
| employed | Работает по найму | EMPLEADO |
| unemployed | Безработный | DESEMPLEADO |
| pupil | Школьник | ESCOLAR |
| student | Студент | ESTUDIANTE |
| pensioner | Пенсионер | JUBILADO |
| entrepreneur | Индивидуальный предприниматель | EMPRESARIO INDIVIDUAL |
| selfEmployed | Самозанятый | TRABAJADOR AUTÓNOMO |

Правила `visible` (всё остальное видно всегда):

| Поля | Видны, когда |
|---|---|
| `sponsorWho` | `payer === "sponsor"` (правило переезжает сюда из `validate` и `printedText`) |
| `position` | `employment` не `unemployed`, `pupil`, `student`, `pensioner` |
| `employerName`, `employerAddress`, `employerPhone`, `employerEmail` | `employment` не `unemployed`, `pensioner` |
| `actualCountry` … `actualPostcode` | `actualDiffers === "yes"` |

Строки адреса: первая — `улица дом-квартира` (`-квартира` только если есть квартира), вторая — `индекс город, страна`; пропущенные части не оставляют лишних пробелов, запятых и дефисов.

Клетка `employer` в `ES.text`: `{ page: 1, x: 51, y: 517, size: 9, maxWidth: 490 }` — одна строка между подписью п. 22 и рамкой п. 23. E-mail работодателя испанский бланк не просит: он вводится, но не печатается.

- [ ] **Step 1: Тесты**

`print.test.ts`:

```ts
const REG = { regCountry: "Belarus", regCity: "Minsk", regStreet: "ul. Lenina", regHouse: "5", regFlat: "12", regPostcode: "220030" }
const ACT = { actualCountry: "Belarus", actualCity: "Brest", actualStreet: "ul. Sovetskaya", actualHouse: "1", actualFlat: "", actualPostcode: "224000" }

test("item 19 prints the registered address, or the actual one when it differs", () => {
  expect(printedText({ ...SPECIMEN, ...REG, ...ACT, actualDiffers: "no" }, ES)).toMatchObject({ address1: "UL. LENINA 5-12", address2: "220030 MINSK, BELARUS" })
  expect(printedText({ ...SPECIMEN, ...REG, ...ACT, actualDiffers: "yes" }, ES)).toMatchObject({ address1: "UL. SOVETSKAYA 1", address2: "224000 BREST, BELARUS" })
})

test("an address with missing parts prints without stray commas or dashes", () => {
  expect(addressLines({ country: "Belarus", city: "Minsk", street: "", house: "", flat: "", postcode: "" })).toEqual(["", "Minsk, Belarus"])
  expect(addressLines({ country: "", city: "Minsk", street: "ul. Lenina", house: "5", flat: "", postcode: "220030" })).toEqual(["ul. Lenina 5", "220030 Minsk"])
})

test("item 21 prints the position, or the status in the template's language when no position applies", () => {
  expect(printedText({ ...SPECIMEN, employment: "employed", position: "Engineer" }, ES).profession).toBe("ENGINEER")
  expect(printedText({ ...SPECIMEN, employment: "student", position: "Engineer" }, ES).profession).toBe("ESTUDIANTE")
  expect(printedText({ ...SPECIMEN, employment: "pensioner", position: "" }, ES).profession).toBe("JUBILADO")
})

test("item 22 joins name, address and phone, never the e-mail, and is left out for the unemployed and pensioners", () => {
  const job = { employerName: "Belaz", employerAddress: "Zhodino", employerPhone: "+375 1775 00000", employerEmail: "hr@belaz.example" }
  expect(printedText({ ...SPECIMEN, ...job, employment: "employed" }, ES).employer).toBe("BELAZ, ZHODINO, +375 1775 00000")
  expect(printedText({ ...SPECIMEN, ...job, employment: "pensioner" }, ES)).not.toHaveProperty("employer")
})

test("every employment status has a name in the template", () => {
  expect(Object.keys(ES.employment).sort()).toEqual(Object.keys(EMPLOYMENT).sort())
})
```

`mrz.test.ts`:

```ts
test("validate ignores a hidden field even in Cyrillic, and checks it once it shows", () => {
  expect(validate({ ...emptyValues(), employment: "pensioner", employerName: "Ромашка" }, TODAY).errors.employerName).toBeUndefined()
  expect(validate({ ...emptyValues(), employment: "employed", employerName: "Ромашка" }, TODAY).errors.employerName).toBe("Анкета заполняется латиницей")
})
```

В существующем тесте латиницы `address1` → `regStreet`.

- [ ] **Step 2: Запустить — FAIL** (нет `addressLines`, `EMPLOYMENT`, `employment`): `npm test`

- [ ] **Step 3: Данные заявителя**

`anketa.ts`: из `TEXT_KEYS` убрать `address1`, `address2`, `profession`; добавить `regCountry`, `regCity`, `regStreet`, `regHouse`, `regFlat`, `regPostcode`, `actualCountry`, `actualCity`, `actualStreet`, `actualHouse`, `actualFlat`, `actualPostcode`, `position`, `employerName`, `employerAddress`, `employerPhone`, `employerEmail`. `EMPLOYMENT`, `ACTUAL_ADDRESS`, `visible()` по таблицам. `emptyValues()`: `employment: ""`, `actualDiffers: "no"`. `SPECIMEN`: прописка `regStreet: "Heidestrasse"`, `regHouse: "17"`, `regPostcode: "51147"`, `regCity: "Koeln"`, `regCountry: "Germany"` (первый тест `print.test.ts` не меняется), работа из `job` выше, `employment: "employed"`, `position: "Engineer"`.

- [ ] **Step 4: Печать и проверки**

`addressLines`; `printedText`: значения скрытых полей читаются как `""` (через `visible`); `address1`/`address2` ← `addressLines` фактического адреса при `actualDiffers === "yes"`, иначе прописки; `profession` ← должность, иначе `t.employment[v.employment]`; `employer` ← непустые из названия, адреса, телефона через `", "`. `ES.employment`, `ES.text.employer`. `validate`: проверка латиницы пропускает `!visible(k, v)`; частный случай `sponsorWho` удалить.

- [ ] **Step 5: Запустить — PASS:** `npm test && npx tsc -b && npx eslint .`

- [ ] **Step 6: Форма**

Секции: «Адрес и контакты» (п. 19: страна, город, улица, дом, квартира, индекс прописки; «19. Фактический адрес» — выбор из `ACTUAL_ADDRESS`; те же шесть полей для фактического; e-mail, телефон; п. 20) и «Работа или учёба» («21. Статус занятости» — выбор из `EMPLOYMENT`, `hint: "profession"`; «21. Должность»; «22. Место работы» или «22. Учебное заведение» для `pupil`/`student`; адрес, телефон, e-mail). `Field.label: string | ((v: Values) => string)`. Свойство `show` заменяется на `visible(f.key, values)`.

- [ ] **Step 7: Проверить в браузере и на бланке**

Смена статуса на «Пенсионер» прячет место работы и должность, подпись у статуса — «в анкете: JUBILADO». `PDF_OUT` + рендер страницы 1: адрес в п. 19, строка п. 22 внутри своей рамки и не задевает подпись.

- [ ] **Step 8: Коммит** `feat: questionnaire address, employment status and employer or school (items 19, 21, 22)`

---

### Task 4: Приглашающая сторона (пп. 31–32)

**Files:**
- Modify: `src/lib/anketa.ts`, `src/lib/template.ts`, `src/lib/templates/es.ts`, `src/lib/print.ts`, `src/lib/print.test.ts`, `src/lib/specimen.ts`, `src/components/AnketaForm.tsx`

**Interfaces:**
- Consumes: `visible`, `printedText`, `SelectKey` (Task 3).
- Produces: `HOST_KIND = { person: "Частное лицо", hotel: "Гостиница" }`, `SelectKey += "hostKind"`; `PRINT_KEYS += "hostEmail" | "org" | "orgContact" | "orgContactEmail" | "orgPhone"`.

`TEXT_KEYS`: убрать `host`; добавить `hostSurname`, `hostFirstName`, `hotelName`, `hostEmail`, `orgName`, `orgAddress`, `orgContactSurname`, `orgContactFirstName`, `orgPhone`, `orgEmail`. `emptyValues()`: `hostKind: "person"`. `visible`: `hotelName` — при `hostKind === "hotel"`, `hostSurname`/`hostFirstName` — при `"person"`.

Клетки `ES.text` (страница 2 — третья страница бланка; сняты с бланка, Task 1 Step 7 проверяет глазами):

| Ключ | page | x | y | size | maxWidth |
|---|---|---|---|---|---|
| `hostAddress1` | 2 | 53.1 | 752 | 10 | 240 |
| `hostAddress2` | 2 | 53.1 | 742 | 10 | 240 |
| `hostEmail` | 2 | 53.1 | 732 | 10 | 240 |
| `org` | 2 | 51 | 703.5 | 10 | 490 |
| `orgContact` | 2 | 51 | 650 | 10 | 240 |
| `orgContactEmail` | 2 | 51 | 640 | 10 | 240 |
| `orgPhone` | 2 | 300 | 670 | 10 | 240 |

`hostAddress1`/`hostAddress2` сдвигаются вверх и мельчают (было y 751.1/740.1, size 11), чтобы под ними поместился e-mail. `host` и `hostPhone` остаются на своих местах.

- [ ] **Step 1: Тесты**

```ts
test("item 31 prints the person as SURNAME FIRSTNAME, or the hotel name", () => {
  const host = { hostSurname: "Garcia Lopez", hostFirstName: "Ana", hotelName: "Hotel Ejemplo" }
  expect(printedText({ ...SPECIMEN, ...host, hostKind: "person" }, ES).host).toBe("GARCIA LOPEZ ANA")
  expect(printedText({ ...SPECIMEN, ...host, hostKind: "hotel" }, ES).host).toBe("HOTEL EJEMPLO")
})

test("items 31 and 32 print together, e-mails as typed", () => {
  const p = printedText({
    ...SPECIMEN, hostKind: "hotel", hotelName: "Hotel Ejemplo", hostEmail: "Reservas@Ejemplo.example",
    orgName: "Acme SL", orgAddress: "Calle Mayor 1, Madrid", orgContactSurname: "Perez", orgContactFirstName: "Juan",
    orgPhone: "+34 910 000 001", orgEmail: "Juan.Perez@acme.example",
  }, ES)
  expect(p).toMatchObject({
    host: "HOTEL EJEMPLO", hostEmail: "Reservas@Ejemplo.example",
    org: "ACME SL, CALLE MAYOR 1, MADRID", orgContact: "PEREZ JUAN", orgContactEmail: "Juan.Perez@acme.example", orgPhone: "+34 910 000 001",
  })
})
```

- [ ] **Step 2: Запустить — FAIL:** `npx vitest run src/lib/print.test.ts`

- [ ] **Step 3: Данные, печать, клетки**

`host` ← `hotelName` или `hostSurname hostFirstName` (видимые, через пробел); `org` ← `orgName, orgAddress`; `orgContact` ← `orgContactSurname orgContactFirstName`; `orgContactEmail` ← `orgEmail`; `hostEmail`, `orgContactEmail` не переводятся в заглавные. Клетки по таблице. `SPECIMEN` получает п. 31 (гостиница) и п. 32 из теста.

- [ ] **Step 4: Запустить — PASS:** `npm test && npx tsc -b && npx eslint .`

- [ ] **Step 5: Форма**

Секция «Приглашающая сторона»: «31. Кто приглашает» (`HOST_KIND`), «31. Фамилия», «31. Имя», «31. Название гостиницы», «31. Адрес», «31. Адрес, продолжение», «31. Телефон», «31. E-mail»; «32. Организация», «32. Адрес организации», «32. Фамилия контактного лица», «32. Имя контактного лица», «32. Телефон», «32. E-mail контактного лица».

- [ ] **Step 6: Итоговая проверка**

`npm test && npx tsc -b && npx eslint . && npx vite build`. `PDF_OUT` + рендер страниц 0–3: каждое значение `SPECIMEN` внутри своей клетки, ничего не залезает на подписи и рамки (особенно п. 22, п. 31 e-mail, п. 32). В браузере: заполнить всё, «Одобрить» → PDF на 4 страницы.

- [ ] **Step 7: Коммит** `feat: inviting person or hotel and inviting organization (items 31, 32)`
