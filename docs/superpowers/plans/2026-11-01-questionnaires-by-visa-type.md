# Анкета под каждый тип визы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Специалист выбирает одну из десяти анкет (тип визы) и получает её на бланке заказчика: PDF-форму с редактируемыми полями, заполненную по именам полей.

**Architecture:** Анкета (`Questionnaire`, `src/lib/questionnaire.ts`) — это бланк, страна для списка городов, номера пунктов и предустановки. Бланк (`Blank`) — файл PDF-формы в `public/blanks/` и два соответствия: «текстовое поле PDF → что печатать» и «вариант выбора → флажок или переключатель». `printedText(v, q)` по-прежнему решает, какой текст попадает на бумагу; `fillForm` только раскладывает его по полям. Пять Word-бланков один раз превращаются в PDF-формы скриптом `scripts/blanks/make-form.mjs` (LibreOffice + PDFKit + pdf-lib); у таких форм имя поля и есть «что печатать», поэтому их описание строится из списка полей.

**Tech Stack:** Vite 8, React 19, TypeScript 6, pdf-lib 1.17, vitest. Для сборки бланков (только у разработчика): LibreOffice из Homebrew, python3 (stdlib), osascript (JXA + PDFKit).

**Spec:** `docs/superpowers/specs/2026-11-01-questionnaires-by-visa-type-design.md`

## Global Constraints

- Всё работает в браузере, бэкенда нет; данные клиента не покидают устройство.
- Результат любой анкеты — PDF-форма, заполненная по полям через pdf-lib и не сплющенная. Имя файла `anketa-<ФАМИЛИЯ>.pdf`, предпросмотр и кнопка «Скачать PDF» как сейчас.
- Поля рисуются Helvetica (WinAnsi): проверка «Анкета заполняется латиницей» на всех текстовых полях, включая новые.
- Значения ЗАГЛАВНЫМИ, кроме e-mail. Даты `ДД-ММ-ГГГГ` во всех бланках.
- Страна первого въезда, статус занятости и город подачи печатаются по-английски из одной таблицы на все анкеты: `POLAND`, `STUDENT`, `MINSK`, `MOSCOW`.
- Поле скрыто (правило `visible` или его пункта нет в анкете) — оно не показывается, не печатается и не проверяется.
- Обязательные поля не меняются: пп. 1, 3, 4, 7, 13, 15.
- Новый бланк = его PDF-форма, его описание (или сгенерированный список полей), строка в `QUESTIONNAIRES` и, если нужно, города в `cities.ts`. Больше ничего не правится.
- Интерфейс на русском, с заглавной только первое слово, без эмодзи.
- Тестовый заявитель — `SPECIMEN` (Erika Mustermann из образца немецкого паспорта) и вымышленные адреса.
- Тесты импортируют модули относительными путями, как существующие (`./print`, не `@/lib/print`).
- Каждая задача заканчивается коммитом; сообщение: зачем, что изменено, чем доказано. Push не делаем.

### Данные образцов (задачи 1, 3, 5–9)

- Образцы заказчика заполнены реальными людьми. Их копии лежат во временной папке вне репозитория, путь даёт диспетчер. В репозиторий образцы не копируются. Их значения не пишутся в код, тесты, документы, отчёты и сообщения коммитов.
- В папку образцов не делать `cd`. Скрипты лежат в другой папке и получают путь аргументом, python запускается с `-I`.
- Текст образца выводится только через `python3 -I scripts/blanks/docx.py dump` (маскирует значения, Task 5) и через проверку утечек. Страницы образцов не рендерятся в картинки; рендерятся только очищенные бланки и PDF-формы.
- Перед коммитом каждого чистого бланка и каждой PDF-формы — **проверка утечек**. Это одноразовый скрипт во временной папке, он не коммитится. Значения он берёт из образца: текст заменённых и стёртых прогонов Word (`removed.txt` от `docx.py apply`), `docProps`, все значения полей PDF-образца, сведения о документе. Каждое значение длиной от 3 символов ищется без учёта регистра во всех частях `.docx`, в байтах PDF и в его распакованных потоках (`node:zlib`). Скрипт печатает число проверенных значений, а для находки — место и форму значения (`Aaaa 9999`), не само значение. Находок быть не должно.

## Review Focus

1. Сменили анкету, а выбранного варианта нет в новом бланке (пол «Иное» или «партнёрство» → «Польша гости Д»): у поля ошибка «Этого варианта нет в бланке», PDF не формируется, ничего не отмечается молча. Тест — Task 2.
2. В форме уже что-то отмечено (у болгарской по умолчанию «Male» и оба варианта п. 20): после заполнения отмечены только выборы заявителя. Тест — Task 2 (общий для всех бланков), болгарская форма попадает в него в Task 3.
3. Длинное значение (адрес приглашающего на 120 символов) в однострочном поле: шрифт уменьшается под ширину поля, а не обрезается. Тест — Task 2 (`fitFontSize`), глазами — в задачах бланков.
4. П. 26: введены два периода, потом выбрано «нет» — периоды не печатаются. П. 25 при одной дате или выезде раньше въезда не печатается вовсе (не «0» и не минус). Тест — Task 2.
5. Переход «Польша рабочая» → «Польша гости Д»: основание `PRACA` остаётся в данных, но не печатается и не проверяется. Город подачи при смене на анкету с тем же списком городов (Польша → Венгрия) остаётся, с другим (Польша → Греция) сбрасывается. Тест — Task 2.

## File Structure

| Файл | Ответственность |
|---|---|
| `src/lib/anketa.ts` | Данные заявителя: новые ключи, `Item`/`Items`, `ITEM_OF`, `visible(key, v, items)` |
| `src/lib/questionnaire.ts` | `Blank`, `Tick`, `Questionnaire`, нумерации А/Б/Д, `QUESTIONNAIRES`, `applyQuestionnaire`, `offered`, `fromFields`, подписи с номерами |
| `src/lib/blanks/pl-d.ts`, `bg.ts` | Описания чужих PDF-форм: имена полей → что печатать, варианты → флажки |
| `src/lib/blanks/<id>.fields.ts` | Списки полей PDF-форм из Word, их пишет `make-form` |
| `src/lib/print.ts` | `PRINT_KEYS`, английские таблицы, `printedText(v, q)`, `cellText`, `addressLine`, `stayDays` |
| `src/lib/fill.ts` | `fillForm(bytes, v, q)`, `fitFontSize` (заменяет `pdf.ts`) |
| `src/lib/validate.ts` | `validate(v, q, today)` |
| `src/lib/cities.ts` | `BG`, `MOSCOW` по-английски |
| `src/components/AnketaForm.tsx`, `src/App.tsx` | Выбор анкеты, номера пунктов, варианты бланка, новые поля |
| `public/blanks/*.pdf` | Семь PDF-форм: `pl-c`, `pl-d`, `bg`, `hu`, `gr`, `es`, `it` |
| `blanks-src/*.docx` | Чистые Word-бланки с метками (исходники, сайтом не отдаются) |
| `scripts/blanks/clean-pdf.mjs` | Очистка PDF-формы заказчика |
| `scripts/blanks/docx.py` | `dump` (с маской), `apply` (правки → чистый бланк), `passes` (проходы A и B) |
| `scripts/blanks/find-text.js` | JXA: где на страницах метки и глифы `☐` |
| `scripts/blanks/make-form.mjs` | Чистый Word-бланк → PDF-форма + список полей |
| Удаляются | `src/lib/template.ts`, `src/lib/templates/es.ts`, `src/lib/pdf.ts`, `src/lib/pdf.test.ts`, `public/anketa-template.pdf`, `scripts/make_template.py` |

## Как Word-бланк становится PDF-формой (задачи 5–9)

Метки в чистом Word-бланке `blanks-src/<id>.docx` (решение сборщика, уточняет глоссарий спеки):

- `{{<cell>:<W>x<H>}}` — текстовое поле W×H pt. `<cell>` — ключ печати или два через `+` (`address+email`); так поле и называется в PDF-форме. Левый край поля там, где начинается метка; верхний край на 9 pt выше её базовой линии. При H ≥ 20 поле многострочное.
- `{{<tick>}}` (без размера) сразу после глифа `☐` — флажок с именем `<tick>` (ключи вариантов — Task 2, «Tick keys»).
- Метка — весь текст своего прогона (`w:r`). Любой квадратик бланка (символ, маркер списка, фигура, поле-флажок Word) превращается в текстовый `☐` с меткой следом. Пунктам из «Не целей» спеки метки не ставятся.

`make-form` делает два прохода. В проходе A метки набраны кеглем 1 pt, по ним находятся места полей. В проходе B метки стёрты, из него собирается форма. Крошечные метки в A чуть сдвигают свою строку, поэтому: флажок ставится на k-й глиф `☐` страницы в проходе B, а имя получает от k-й метки флажка той же страницы в A; x текстового поля уменьшается на ширины 1-pt меток, стоящих левее на той же строке.

Порядок для одного бланка:

1. `python3 -I scripts/blanks/docx.py dump <образец.docx>` — где значения, где квадратики, какие картинки.
2. Файл правок во временной папке → `docx.py apply <образец> <правки.json> blanks-src/<id>.docx --removed <tmp>/removed.txt`.
3. `node scripts/blanks/make-form.mjs blanks-src/<id>.docx public/blanks/<id>.pdf src/lib/blanks/<id>.fields.ts`.
4. Рендер пустой формы (`osascript -l JavaScript scripts/render-pdf-page.js public/blanks/<id>.pdf <tmp> 0 1 …`). Сверить: страниц столько же, сколько в Word (`docProps/app.xml`, `<Pages>`), все пункты, рамки и логотипы на месте, поля не закрывают подписи бланка.
5. Регистрация в `QUESTIONNAIRES`, `npm test`.
6. `PDF_OUT=<tmp> npx vitest run src/lib/fill.test.ts` и рендер заполненной формы: значения в своих ячейках, длинные читаются, галочки на нужных вариантах.
7. Проверка утечек по всем образцам этого бланка, затем коммит.

---

### Task 1: Чистые польская и болгарская PDF-формы

**Files:**
- Create: `scripts/blanks/clean-pdf.mjs`, `public/blanks/pl-d.pdf`, `public/blanks/bg.pdf`, `src/lib/blank-files.test.ts`

**Interfaces:**
- Produces: `node scripts/blanks/clean-pdf.mjs <in.pdf> <out.pdf>`; файлы `public/blanks/pl-d.pdf` (80 полей) и `public/blanks/bg.pdf`.

- [ ] **Step 1: Write the failing test** `src/lib/blank-files.test.ts` — по одному тесту на каждый `*.pdf` из `public/blanks/` (через `readdirSync`), так что следующие формы проверяются сами:

```ts
test(`${file} carries no applicant data or metadata`, async () => {
  const doc = await PDFDocument.load(readFileSync(new URL(file, DIR)), { updateMetadata: false })
  expect([doc.getAuthor(), doc.getCreator(), doc.getProducer(), doc.getTitle(), doc.getSubject(), doc.getKeywords()]).toEqual(Array(6).fill(undefined))
  expect(doc.catalog.get(PDFName.of("Metadata"))).toBeUndefined()
  const form = doc.getForm()
  expect(form.acroForm.dict.get(PDFName.of("XFA"))).toBeUndefined()
  for (const f of form.getFields()) {
    if (f instanceof PDFTextField) expect(f.getText() ?? "").toBe("")
    if (f instanceof PDFCheckBox) expect(f.isChecked()).toBe(false)
    if (f instanceof PDFRadioGroup) expect(f.getSelected()).toBeUndefined()
  }
})
test("the blanks folder holds the customer's two PDF forms", () => {
  expect(readdirSync(DIR)).toEqual(expect.arrayContaining(["pl-d.pdf", "bg.pdf"]))
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/blank-files.test.ts` — Expected: FAIL (нет `public/blanks/`).

- [ ] **Step 3: Implement `scripts/blanks/clean-pdf.mjs`.** Загрузка с `{ updateMetadata: false }`; отказ с сообщением, если в трейлере есть `/Encrypt`. Все текстовые поля пустые (и без `/RV`), флажки сняты, у групп переключателей `/V` и `/AS` всех виджетов — `Off` (`acroField.setValue(PDFName.of("Off"))`). Удаляются `/XFA` и `/NeedsRendering` из AcroForm, `/Metadata` из каталога, `/Info` из трейлера. Затем удаляются все объекты, недостижимые из каталога (обход ссылок по словарям, массивам и словарям потоков от `trailerInfo.Root`, `context.delete(ref)` для остальных): иначе в файле остаются старые потоки вида полей с текстом клиента. Печатает число полей.

- [ ] **Step 4: Run** на образцах (путь от диспетчера): `ПОЛЬША ГОСТИ Д.pdf` → `public/blanks/pl-d.pdf`, `БОЛГАРИЯ.pdf` → `public/blanks/bg.pdf`. Expected: «80 fields» у польской.

- [ ] **Step 5: Проверка утечек:** `pl-d.pdf` против всех трёх польских Д-образцов (`ПОЛЬША ГОСТИ Д`, `КП`, `РАБОЧАЯ`), `bg.pdf` против `БОЛГАРИЯ.pdf`. Expected: 0 находок.

- [ ] **Step 6: Рендер** всех страниц обеих форм: бланк пустой, вёрстка цела.

- [ ] **Step 7: Run** `npx vitest run src/lib/blank-files.test.ts` — Expected: PASS.

- [ ] **Step 8: Commit** `scripts/blanks/clean-pdf.mjs`, `public/blanks/`, `src/lib/blank-files.test.ts`.

---

### Task 2: Анкеты, печать и заполнение по полям

Переводит программу с печати по координатам на заполнение полей. После задачи есть три анкеты на польской форме Д; остальные добавят следующие задачи.

**Files:**
- Create: `src/lib/questionnaire.ts`, `src/lib/questionnaire.test.ts`, `src/lib/blanks/pl-d.ts`, `src/lib/fill.ts`, `src/lib/fill.test.ts`
- Modify: `src/lib/anketa.ts`, `src/lib/print.ts`, `src/lib/print.test.ts`, `src/lib/validate.ts`, `src/lib/cities.ts`, `src/lib/specimen.ts`, `src/lib/mrz.test.ts`, `src/App.tsx`, `src/components/AnketaForm.tsx`, `README.md`
- Delete: `src/lib/template.ts`, `src/lib/templates/es.ts`, `src/lib/pdf.ts`, `src/lib/pdf.test.ts`, `public/anketa-template.pdf`, `scripts/make_template.py`

**Interfaces:**
- Consumes: `public/blanks/pl-d.pdf` (Task 1).
- Produces:

```ts
// anketa.ts
// TEXT_KEYS: + "kpNumber", "basis", "workPermit", "hostAddress", "prevVisa1From", "prevVisa1To", … "prevVisa5To";
//            − "hostAddress1", "hostAddress2". DATE_KEYS: + prevVisa1From … prevVisa5To.
// OPTIONS.prevVisas = { no: "Нет", yes: "Да" }, emptyValues().prevVisas = "no".
export type Item = "address" | "residence" | "occupation" | "employer" | "purpose" | "kpNumber" | "basis"
  | "destination" | "firstEntry" | "entries" | "prevVisas" | "fingerprints" | "arrival" | "departure"
  | "host" | "org" | "costs" | "workPermit" | "submission"
// No key: the questionnaire has no such item. null: the item is there, the blank prints no number.
export type Items = Partial<Record<Item, number | null>>
export const ITEM_OF: Partial<Record<keyof Values, Item>>
export function visible(key: keyof Values, v: Values, items: Items): boolean

// print.ts
export type PrintKey = (typeof PRINT_KEYS)[number]
export type CellSpec = PrintKey | `${PrintKey}+${PrintKey}`
export const COUNTRY_EN: Record<SchengenCode, string>
export const STATUS_EN: Record<EmploymentCode, string>
export function addressLine(a: Address): string
export function stayDays(arrivalIso: string, departureIso: string): string
export function printedText(v: Values, q: Questionnaire): Partial<Record<PrintKey, string>>
export function cellText(spec: CellSpec, printed: Partial<Record<PrintKey, string>>, multiline: boolean): string

// questionnaire.ts
// A checkbox by its field name, or the widget of a radio group whose appearance on-name is `on`.
export type Tick = string | { radio: string; on: string }
// text: PDF text field name → what it prints. ticks: tick key → the box that shows it.
export type Blank = { file: string; text: Record<string, CellSpec>; ticks: Record<string, Tick> }
export type Questionnaire = { id: string; label: string; country: CountryCode; blank: Blank; items: Items; presets: Partial<Values> }
export const NUMBERING_A: Items, NUMBERING_B: Items, NUMBERING_D: Items
export const QUESTIONNAIRES: Questionnaire[]
export function applyQuestionnaire(v: Values, from: Questionnaire, to: Questionnaire): Values
export function offered<T extends Record<string, string>>(blank: Blank, group: string, options: T): Partial<T>
export function fromFields(file: string, fields: { text: readonly string[]; boxes: readonly string[] }): Blank

// fill.ts
export function fitFontSize(widthAt1pt: number, box: { width: number; height: number }, formSize: number): number
export async function fillForm(bytes: ArrayBuffer | Uint8Array, v: Values, q: Questionnaire): Promise<Uint8Array>

// validate.ts
export function validate(v: Values, q: Questionnaire, today?: Date): { errors: Errors; warnings: string[] }
```

**Значения, которые фиксирует эта задача:**

- **Tick keys:** `${ChoiceKey}.${вариант}` (`sex.F`, `prevVisas.no`), `means.self.${вариант}`, `means.sponsor.${вариант}`, `sponsorOther` (отмечается вместе с напечатанным `sponsorWho`).
- **`PRINT_KEYS`:** `surname`, `surnameAtBirth`, `firstName`, `birthDate`, `placeOfBirth`, `countryOfBirth`, `nationality`, `nationalityAtBirth`, `nationalId`, `docNumber`, `issueDate`, `expiryDate`, `issuedBy`, `address`, `email`, `phone`, `profession`, `employer`, `purposeOther`, `basis`, `destination`, `firstEntry`, `duration`, `prevVisa1From` … `prevVisa5To`, `arrivalDate`, `departureDate`, `host`, `hostAddress`, `hostPhone`, `hostEmail`, `org`, `orgContact`, `orgPhone`, `orgEmail`, `sponsorWho`, `workPermit`, `place`, `date`. Уходят `address1`, `address2`, `hostAddress1`, `hostAddress2`, `orgContactEmail`.
- **Что печатает ключ** (остальные — как сейчас; всё через `visible(..., q.items)`):
  - `address`: `addressLine` = `СТРАНА, ИНДЕКС, ГОРОД, УЛИЦА ДОМ-КВАРТИРА`, заглавными, адрес прописки или фактический (как сейчас);
  - `profession`: должность, иначе `STATUS_EN[employment]`;
  - `purposeOther`: `KARTA POLAKA <НОМЕР>`, если `kpNumber` виден и не пуст;
  - `firstEntry`: `COUNTRY_EN[код]`; `duration`: `stayDays(arrivalDate, departureDate)`;
  - `hostAddress`, `basis`, `workPermit`: заглавными; `orgEmail`, `hostEmail`, `email`: как введены;
  - `place`: `CITIES[q.country]…print`; даты везде `toDmy(iso)`.
- **`cellText`:** части `spec.split("+")`, пустые пропускаются, разделитель `", "`, в многострочном поле `"\n"`.
- **`stayDays`:** `""`, если одна из дат не настоящая (`realIso`) или выезд раньше въезда; иначе (выезд − въезд) в днях + 1.
- **`STATUS_EN`:** employed `EMPLOYEE`, unemployed `NO OCCUPATION`, pupil `PUPIL`, student `STUDENT`, pensioner `PENSIONER`, entrepreneur `INDIVIDUAL ENTREPRENEUR`, selfEmployed `SELF-EMPLOYED`.
- **`COUNTRY_EN`:** AT AUSTRIA, BE BELGIUM, BG BULGARIA, HU HUNGARY, DE GERMANY, GR GREECE, DK DENMARK, IS ICELAND, ES SPAIN, IT ITALY, LV LATVIA, LT LITHUANIA, LI LIECHTENSTEIN, LU LUXEMBOURG, MT MALTA, NL NETHERLANDS, NO NORWAY, PL POLAND, PT PORTUGAL, RO ROMANIA, SK SLOVAKIA, SI SLOVENIA, FI FINLAND, FR FRANCE, HR CROATIA, CZ CZECH REPUBLIC, CH SWITZERLAND, SE SWEDEN, EE ESTONIA.
- **`ITEM_OF`:** `reg*`, `actualDiffers`, `actual*`, `email`, `phone` → address; `residesElsewhere` → residence; `employment`, `position` → occupation; `employer*` → employer; `purpose` → purpose; `kpNumber`, `basis`, `destination`, `firstEntry`, `entries`, `fingerprints`, `workPermit` → одноимённые; `prevVisas`, `prevVisa*` → prevVisas; `arrivalDate` → arrival; `departureDate` → departure; `host*`, `hotelName` → host; `org*` → org; `payer`, `sponsorWho`, `means` → costs; `submissionCity`, `submissionDate` → submission. Пп. 1–16 пункта не имеют и видны всегда.
- **`visible`:** сначала `ITEM_OF[key]` должен быть в `items`, затем прежние правила; `prevVisa1*` видны при `prevVisas === "yes"`, `prevVisa<n>*` — когда видна и не пуста хотя бы одна дата периода n−1.
- **Нумерации:**
  - `NUMBERING_A` = address 19, residence 20, occupation 21, employer 22, purpose 23, destination 25, firstEntry 26, entries 27, arrival 28, departure 28, fingerprints 29, host 31, org 32, costs 33, submission null;
  - `NUMBERING_B` = как А, но arrival null, departure null, fingerprints 28, host 30, org 31, costs 32;
  - `NUMBERING_D` = address 17, residence 18, occupation 19, employer 20, purpose 21, firstEntry 23, entries 24, prevVisas 26, fingerprints 27, arrival 29, departure 30, host 31, org 32, costs 33, submission 37.
- **Анкеты этой задачи** (country `PL`, blank `PL_D`): `pl-guest-d` «Польша гости Д» (D, presets purpose family, hostKind person); `pl-kp` «Польша КП» (D + kpNumber 21; purpose other, hostKind person); `pl-work` «Польша рабочая» (D + basis 21, workPermit 34; purpose other, basis `PRACA`).
- **`applyQuestionnaire`:** `{ ...v, ...to.presets }`; `submissionCity` → `""`, только если `CITIES[from.country] !== CITIES[to.country]` (у PL и HU один массив).
- **`offered`:** варианты, у которых в `blank.ticks` есть ключ `${group}.${вариант}`.
- **`fromFields`:** имя текстового поля — его же `CellSpec`, имя флажка — его же tick key.
- **`PL_D`** (`src/lib/blanks/pl-d.ts`, file `blanks/pl-d.pdf`):
  - text: Text1 surname, Text2 surnameAtBirth, Text3 firstName, Text4 birthDate, Text5 placeOfBirth, Text6 countryOfBirth, Text7 nationality, Text8 nationalityAtBirth, Text10 nationalId, Text11 docNumber, Text12 issueDate, Text13 expiryDate, Text14 issuedBy, Text15 phone, Text16 `address+email`, Text20 profession, Text21 employer, Text23 purposeOther, Text25 basis, Text53 firstEntry, Text54 duration, `Text26.0`/`Text26.1` prevVisa1From/To … `Text30.0`/`Text30.1` prevVisa5From/To, Text32 arrivalDate, Text34 departureDate, Text33 host, Text36 `hostAddress+hostEmail`, Text35 hostPhone, Text37 org, Text38 orgPhone, Text39 `orgContact+orgEmail`, Text24 sponsorWho, Text41 workPermit, Text47 `place+date`, Text48 `place+date`;
  - радио (по on-name виджета): Group49 sex M "0", F "1"; Group50 maritalStatus single 0, married 1, separated 2, divorced 3, widowed 4, other 5; Group51 docType ordinary 0, diplomatic 1, service 2, official 3, special 4, other 5; Group52 residesElsewhere no 0, yes 1; Group53 purpose tourism 0, business 1, family 2, culture 3, sport 4, other 5, study 6, medical 7, official 8; Group54 entries one 0, two 1, multiple 2; Group55 prevVisas no 0, yes 1; Group56 fingerprints no 0, yes 1;
  - флажки: payer.self "Check Box51", payer.sponsor "Check Box58"; means.self cash 52, cheques 53, card 54, accommodation 55, transport 56, other 57; sponsorOther "Check Box60"; means.sponsor cash 61, accommodation 62, allCovered 63, transport 64, other 65 (имя — `"Check Box" + номер`).
- **`fitFontSize`:** `max(4, min(formSize > 0 ? formSize : 10, (box.width − 4) / widthAt1pt, box.height × 0.75))`.
- **`fillForm`:**
  1. Текст: для каждого `[поле, spec]` из `blank.text` — `cellText(spec, printedText(v, q), поле многострочное)`. В однострочном поле с текстом размер — `fitFontSize`; `formSize` берётся из DA поля (`/(\d*\.?\d+)\s+Tf/`), рамка — первого виджета.
  2. Флажки: сначала выключаются все из `blank.ticks` (флажок `uncheck()`, радио `acroField.setValue(PDFName.of("Off"))`). Потом включаются ключи выборов заявителя: видимые `ChoiceKey` со значением, `means.${payer}.*`, `sponsorOther`. Радио включается через `(group.acroField as PDFAcroRadioButton).setValue(PDFName.of(on))`, не `select()`: в польской форме экспортные значения в `/Opt` повторяются.
  3. `form.updateFieldAppearances(helvetica)`, `pdf.save()`. Без `flatten`.
- **`validate`:** скрытые по `visible(k, v, q.items)` поля не проверяются. Видимый выбор со значением, которого нет в `q.blank.ticks`, даёт ошибку «Этого варианта нет в бланке». Предупреждение о паспорте — без «(п. 28)».

- [ ] **Step 1: Write the failing tests.** `print.test.ts` — переписать под `printedText(v, q)` (`const Q = (id: string) => QUESTIONNAIRES.find((q) => q.id === id)!`). Прежние проверки капса, e-mail, спонсора, п. 22, приглашающих и «чужого» города остаются с новыми ключами (чужой город — на `{ ...Q("pl-guest-d"), country: "ES" }`); проверки `formatDate`, `ES.schengen`, `ES.employment` и двух строк адреса удаляются. Добавить:

```ts
test("the address prints as one line: country, postcode, city, street house-flat", () => {
  expect(printedText({ ...SPECIMEN, ...REG }, Q("pl-guest-d")).address).toBe("BELARUS, 220030, MINSK, UL. LENINA 5-12")
  expect(addressLine({ country: "Belarus", city: "Minsk", street: "", house: "", flat: "", postcode: "" })).toBe("Belarus, Minsk")
})
test("list choices print in English in every questionnaire", () => {
  const p = printedText({ ...SPECIMEN, firstEntry: "PL", submissionCity: "minsk", employment: "student", position: "" }, Q("pl-guest-d"))
  expect(p).toMatchObject({ firstEntry: "POLAND", place: "MINSK", profession: "STUDENT" })
  expect(printedText({ ...SPECIMEN, employment: "pensioner", position: "" }, Q("pl-work")).profession).toBe("PENSIONER")
})
test("item 25 counts the days of the stay, arrival and departure included", () => {
  expect(stayDays("2026-11-02", "2026-11-16")).toBe("15")
  expect(stayDays("2026-11-16", "2026-11-02")).toBe("")
  expect(stayDays("2026-11-02", "")).toBe("")
})
test("the Karta Polaka number and the basis print only where the questionnaire has them", () => {
  const v = { ...SPECIMEN, kpNumber: "ab123", basis: "praca" }
  expect(printedText(v, Q("pl-kp")).purposeOther).toBe("KARTA POLAKA AB123")
  expect(printedText(v, Q("pl-work")).basis).toBe("PRACA")
  expect(printedText(v, Q("pl-guest-d"))).not.toHaveProperty("purposeOther")
  expect(printedText(v, Q("pl-guest-d"))).not.toHaveProperty("basis")
})
test("item 26 periods print only with 'yes', and a period shows only after the one before it", () => {
  const v = { ...SPECIMEN, prevVisas: "yes", prevVisa1From: "2024-02-01", prevVisa1To: "2024-02-10", prevVisa3From: "2025-01-01" }
  expect(printedText(v, Q("pl-guest-d"))).toMatchObject({ prevVisa1From: "01-02-2024", prevVisa1To: "10-02-2024" })
  expect(printedText(v, Q("pl-guest-d"))).not.toHaveProperty("prevVisa3From")
  expect(printedText({ ...v, prevVisas: "no" }, Q("pl-guest-d"))).not.toHaveProperty("prevVisa1From")
})
test("a cell joins its parts with a comma, or a new line in a multiline field, skipping empty ones", () => {
  expect(cellText("place+date", { place: "MINSK", date: "15-10-2026" }, false)).toBe("MINSK, 15-10-2026")
  expect(cellText("place+date", { place: "MINSK", date: "15-10-2026" }, true)).toBe("MINSK\n15-10-2026")
  expect(cellText("place+date", { date: "15-10-2026" }, false)).toBe("15-10-2026")
})
test("every Schengen state, status and city prints in Latin-1", () => {
  expect(Object.keys(COUNTRY_EN).sort()).toEqual(Object.keys(SCHENGEN).sort())
  for (const s of [...Object.values(COUNTRY_EN), ...Object.values(STATUS_EN), ...Object.values(CITIES).flat().map((c) => c.print)])
    expect(s).toMatch(/^[\x20-\x7E\xA0-\xFF]+$/)
})
```

`questionnaire.test.ts`:

```ts
test("item numbers come from the blank's family", () => {
  expect([NUMBERING_D.address, NUMBERING_A.arrival, NUMBERING_B.arrival, NUMBERING_B.fingerprints, NUMBERING_D.submission]).toEqual([17, 28, null, 28, 37])
  expect(Q("pl-kp").items.kpNumber).toBe(21)
  expect([Q("pl-work").items.basis, Q("pl-work").items.workPermit]).toEqual([21, 34])
  expect(Q("pl-guest-d").items).not.toHaveProperty("destination")
})
test("switching applies the new questionnaire's presets and keeps everything else", () => {
  expect(applyQuestionnaire({ ...SPECIMEN, purpose: "tourism" }, Q("pl-guest-d"), Q("pl-work"))).toMatchObject({ purpose: "other", basis: "PRACA", surname: "Mustermann" })
})
test("the submission city resets only when the list of cities changes", () => {
  const pl = Q("pl-guest-d"), v = { ...SPECIMEN, submissionCity: "brest" }
  expect(applyQuestionnaire(v, pl, { ...pl, country: "HU" }).submissionCity).toBe("brest")
  expect(applyQuestionnaire(v, pl, { ...pl, country: "GR" }).submissionCity).toBe("")
})
test("a select offers only the options the blank can tick", () => {
  expect(Object.keys(offered(PL_D, "sex", OPTIONS.sex))).toEqual(["M", "F"])
  expect(offered(PL_D, "maritalStatus", OPTIONS.maritalStatus)).not.toHaveProperty("partnership")
  expect(offered(PL_D, "purpose", OPTIONS.purpose)).not.toHaveProperty("transit")
})
test("every blank names only real print keys and real options", () => {
  for (const { blank } of QUESTIONNAIRES) {
    for (const spec of Object.values(blank.text)) for (const k of spec.split("+")) expect(PRINT_KEYS).toContain(k)
    for (const key of Object.keys(blank.ticks)) expect(isTickKey(key)).toBe(true)  // isTickKey: local helper over OPTIONS, MEANS and "sponsorOther"
  }
})
```

`fill.test.ts` (по одной первой анкете на каждый бланк из `QUESTIONNAIRES`; файл читается из `public/` через `readFileSync`):

```ts
const SPECIMEN_TICKS = ["sex.F", "maritalStatus.married", "docType.ordinary", "residesElsewhere.no", "purpose.tourism",
  "entries.multiple", "fingerprints.no", "payer.sponsor", "means.sponsor.cash", "sponsorOther"]
test(`${blank.file}: SPECIMEN fills every mapped field and ticks exactly its choices, whatever was ticked before`, async () => {
  // Every tick of the blank is turned on first (radios end up on their last option), then fillForm runs on that file.
  // Expected ticks: SPECIMEN_TICKS, plus "prevVisas.no" when the blank has it; every one of them must exist in blank.ticks.
  // For every tick key: on exactly when expected. For every text field: getText() ?? "" === cellText(spec, printedText(SPECIMEN, q), isMultiline()).
  // form.getFields().length is unchanged (not flattened). With PDF_OUT set, the result is written to `${PDF_OUT}/${basename(blank.file)}`.
})
test("a Polish radio group with repeated export values gets exactly the chosen widget", async () => {
  // maritalStatus "divorced": the Group50 widget with on-name "3" has /AS 3, every other widget /AS Off.
})
test("fillForm rejects text that Helvetica cannot encode", async () => {
  await expect(fillForm(PL_D_BYTES, { ...SPECIMEN, placeOfBirth: "Минск" }, Q("pl-guest-d"))).rejects.toThrow()
})
test("a long value keeps the form's font size when it fits and shrinks to the field's width when not", () => {
  expect(fitFontSize(20, { width: 200, height: 14 }, 9)).toBe(9)
  expect(fitFontSize(40, { width: 200, height: 14 }, 9)).toBeCloseTo(4.9)
  expect(fitFontSize(10, { width: 200, height: 14 }, 0)).toBe(10)
  expect(fitFontSize(100, { width: 200, height: 14 }, 9)).toBe(4)
})
```

`mrz.test.ts`: все вызовы `validate(v, TODAY)` → `validate(v, Q("pl-guest-d"), TODAY)` (импорт `QUESTIONNAIRES`). Добавить:

```ts
test("a choice the blank cannot tick is an error", () => {
  expect(validate({ ...emptyValues(), sex: "X" }, Q("pl-guest-d"), TODAY).errors.sex).toBe("Этого варианта нет в бланке")
})
test("a field the questionnaire lacks is neither checked nor printed", () => {
  expect(validate({ ...emptyValues(), basis: "Праца" }, Q("pl-guest-d"), TODAY).errors.basis).toBeUndefined()
  expect(validate({ ...emptyValues(), basis: "Праца" }, Q("pl-work"), TODAY).errors.basis).toBe("Анкета заполняется латиницей")
})
```

и в тесте предупреждений — текст без «(п. 28)».

- [ ] **Step 2: Run** `npm test` — Expected: FAIL (нет `questionnaire.ts`, `fill.ts`, новых экспортов).

- [ ] **Step 3: Implement** `anketa.ts`, `cities.ts` (`CountryCode` + `"BG"`, `CITIES.BG = [MINSK]`, `MOSCOW.print = "MOSCOW"`; комментарий о языке бланка заменить на «печатается по-английски»), `questionnaire.ts`, `blanks/pl-d.ts`, `print.ts`, `fill.ts`, `validate.ts` по значениям выше. `specimen.ts`: `hostAddress: "Calle Mayor 1, 28013 Madrid, Spain"` вместо двух строк.

- [ ] **Step 4: Wire the app** без изменения подписей (они — Task 4):
  - `App.tsx`: состояние `questionnaire` (по умолчанию `QUESTIONNAIRES[0]`) вместо `template`; начальные данные `{ ...emptyValues(), ...QUESTIONNAIRES[0].presets }`; смена анкеты = `setValues((v) => applyQuestionnaire(v, questionnaire, next))` + сброс готового PDF; `validate(values, questionnaire)`; `approve` грузит `q.blank.file` и зовёт `fillForm`.
  - `AnketaForm.tsx`: карточка выбора с подписью «Анкета», описание «От анкеты зависят бланк, пункты и их номера, список городов и предустановки.», варианты `QUESTIONNAIRES` (id → label). Prop `questionnaire` вместо `template`; `visible(f.key, values, questionnaire.items)`; города из `CITIES[questionnaire.country]`; одно поле «31. Адрес» (`hostAddress`) вместо двух.
  - Удалить файлы из списка Delete. В README удалить раздел «Пустой бланк анкеты» (раздел про бланки перепишет Task 5).

- [ ] **Step 5: Run** `npm test && npm run build && npm run lint` — Expected: всё зелёное.

- [ ] **Step 6: Глазами:** `PDF_OUT=<tmp> npx vitest run src/lib/fill.test.ts`, рендер страниц `<tmp>/pl-d.pdf`: значения в своих ячейках, п. 37 дважды, галочки на нужных вариантах, длинные значения читаются.

- [ ] **Step 7: Commit.**

---

### Task 3: Болгарская форма

**Files:**
- Create: `src/lib/blanks/bg.ts`
- Modify: `src/lib/questionnaire.ts`

**Interfaces:**
- Consumes: `Blank`, `Tick`, `CellSpec`, `NUMBERING_B`, общий тест `fill.test.ts` (Task 2).
- Produces: `BG: Blank` (file `blanks/bg.pdf`); анкета `{ id: "bg", label: "Болгария", country: "BG", blank: BG, items: NUMBERING_B, presets: { purpose: "tourism", hostKind: "hotel" } }` сразу после `pl-work`.

Отправная карта (по прошлому осмотру, **каждое поле сверить с подписью бланка рядом с виджетом**; форма пустая, её можно рендерить):

- стр. 1: Text1 surname, Text2 surnameAtBirth, Text3 firstName, Text4 birthDate, Text5 placeOfBirth, Text6 countryOfBirth, Text7 nationality, Text8 nationalityAtBirth, Text11 nationalId; пол — радио group_2 (Male / Female / Other, on-names прочитать `getOnValues`); семейное положение — toggle_9 single, toggle_10 married, toggle_11 partnership, toggle_12 separated, toggle_13 divorced, toggle_14 widowed, toggle_15 other;
- стр. 2: тип документа — флажки «Ordinary passport» … «Other travel document please specify»; Text13–16 — номер, дата выдачи, срок действия, кем выдан (что есть что — по подписям); Text22, Text23 — вероятно адрес (`address+email`) и телефон;
- стр. 3: toggle_1 / toggle_2 — п. 20 no / yes; Text25, Text26 — профессия и работодатель (сверить, Text24–27); цель — флажки tourism … «other please specify» (Text28 — `purposeOther`); Text30 / Text31 — destination / firstEntry (сверить); въезды — «single entry entries», «two entries», multiple; Text32 / Text33 — arrivalDate / departureDate;
- стр. 4: отпечатки toggle_1_2 / toggle_2_2; приглашающее лицо Text39, Text41, Text40; организация Text42, Text44, Text43;
- стр. 5: payer «by the applicant himselfherself» / «by a sponsor host company organisation please specify»; средства заявителя toggle_2_3 … toggle_7; спонсор: toggle_10_2 — sponsorOther с Text45 (`sponsorWho`), toggle_11_2 … toggle_15_2 — его средства;
- стр. 6: Text50 `place+date`.

Не сопоставляются: служебная колонка, Text9, Text10, пп. 17–18, разрешения (Text24/27 по подписи), Text29, Text34–38, toggle_9_2, Text46–49.

- [ ] **Step 1:** Подписи у виджетов: временный скрипт (в tmp) печатает для каждого поля страницу, прямоугольник и текст PDFKit слева и справа от виджета (`page.selectionForRect`).
- [ ] **Step 2: Failing test:** зарегистрировать анкету `bg` с пустым `BG` (`text: {}`, `ticks: {}`); `npx vitest run src/lib/fill.test.ts` — Expected: FAIL (в `BG.ticks` нет `SPECIMEN_TICKS`).
- [ ] **Step 3:** Заполнить `bg.ts` по сверенной карте.
- [ ] **Step 4: Run** `npm test` — Expected: PASS (общий тест включает и снятие заранее отмеченных «Male» и п. 20).
- [ ] **Step 5: Глазами:** рендер `<tmp>/bg.pdf` после `PDF_OUT=<tmp> npx vitest run src/lib/fill.test.ts`.
- [ ] **Step 6: Commit.**

---

### Task 4: Форма по анкете

**Files:**
- Modify: `src/components/AnketaForm.tsx`, `src/lib/questionnaire.ts`, `src/lib/questionnaire.test.ts`

**Interfaces:**
- Consumes: `Item`, `Items`, `ITEM_OF`, `offered`, `visible` (Task 2).
- Produces (в `questionnaire.ts`, чтобы проверять в node):

```ts
// "28. Дата въезда" by the blank's number, the bare label where the blank prints none.
export function itemLabel(label: string, item: Item | undefined, items: Items): string
// "Пункты 19–20", "Пункт 33" or "" for the numbers of the fields a section shows.
export function itemsNote(numbers: number[]): string
```

- [ ] **Step 1: Failing test** в `questionnaire.test.ts`:

```ts
test("a label takes its number from the blank and has none where the blank prints none", () => {
  expect(itemLabel("Дата въезда", "arrival", NUMBERING_A)).toBe("28. Дата въезда")
  expect(itemLabel("Дата въезда", "arrival", NUMBERING_B)).toBe("Дата въезда")
  expect(itemLabel("Дата въезда", "arrival", NUMBERING_D)).toBe("29. Дата въезда")
  expect(itemLabel("1. Фамилия", undefined, NUMBERING_D)).toBe("1. Фамилия")
})
test("a section note spans the numbers its fields show", () => {
  expect([itemsNote([19, 20, 19]), itemsNote([33]), itemsNote([])]).toEqual(["Пункты 19–20", "Пункт 33", ""])
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/questionnaire.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `itemLabel`, `itemsNote` и форму:
  - у полей с пунктом (`ITEM_OF`) подпись без номера, номер даёт `itemLabel`; `subNumbered` остаётся и работает по готовым подписям (`21.1. Цель поездки`, `21.2. Номер Карты поляка`);
  - описание раздела: `itemsNote` номеров показанных полей + прежний текст раздела без номеров («Пункты 17–18. Этих данных нет в документе.»); у «Из документа» описание прежнее;
  - выборы из `OPTIONS` — через `offered(q.blank, key, OPTIONS[key])`, средства — `offered(q.blank, \`means.${payer}\`, MEANS[payer])`;
  - новые поля: «Поездка» — после цели «Номер Карты поляка» (`kpNumber`) и «Основание» (`basis`), после въездов «Визы за последние 5 лет» (`prevVisas`, select) и пары «Виза N: с» / «Виза N: по» (`prevVisaNFrom`/`To`, date, N = 1…5; показ — через `visible`); «Расходы и подача» — «Разрешение на работу» (`workPermit`, wide).
- [ ] **Step 4: Run** `npm test && npm run build && npm run lint` — Expected: PASS.
- [ ] **Step 5: В браузере** (`preview_start`): «Польша гости Д» — «17. Прописка: страна», нет страны назначения, пол без «Иное»; «Польша КП» — «21.2. Номер Карты поляка»; «Польша рабочая» — «34. Разрешение на работу»; «Болгария» — даты въезда и выезда без номера; п. 26 «да» показывает первую пару, заполненная первая — вторую. Скриншот.
- [ ] **Step 6: Commit.**

---

### Task 5: Сборщик PDF-форм из Word и бланк «Польша С»

**Files:**
- Create: `scripts/blanks/docx.py`, `scripts/blanks/find-text.js`, `scripts/blanks/make-form.mjs`, `blanks-src/pl-c.docx`, `public/blanks/pl-c.pdf`, `src/lib/blanks/pl-c.fields.ts`
- Modify: `src/lib/questionnaire.ts`, `README.md`

**Interfaces:**
- Consumes: `fromFields`, `NUMBERING_B`, tick keys и `PRINT_KEYS` (Task 2); общие тесты `blank-files.test.ts`, `fill.test.ts`.
- Produces:
  - `python3 -I scripts/blanks/docx.py dump <in.docx>` — для `word/document.xml`, колонтитулов и сносок печатает абзацы: номер абзаца, затем прогоны `[r<номер>]текст`. Текст абзаца маскируется **целиком, до разбивки на прогоны**: склеенный текст режется на слова по пробелам, табуляциям и разрывам, маска ставится на слово, границы прогонов возвращаются по смещениям. Маска (`A`, `a`, `Б`, `б`, `9` по буквам) ставится на слово, если в нём есть `@`, три и больше цифр подряд или две и больше заглавных подряд (латиница или кириллица). Квадратики, фигуры, поля-флажки Word и маркеры списков печатаются как `[☐]`, `[shape]`, `[chk]`, `[bullet]`. Отдельно — картинки: часть, размер в байтах и пикселях, где используется.
  - `docx.py apply <in.docx> <edits.json> <out.docx> --removed <file>` — правки по номерам абзацев и прогонов: `replace` (прогоны → один прогон-метка со свойствами первого), `clear` (текст прогонов стирается), `box` (квадратик в прогоне → `☐` + прогон-метка). Удаляются `media` (картинки с их рисунками). В `docProps/core.xml` стираются `creator` и `lastModifiedBy`, `docProps/custom.xml` и `customXml/` очищаются от текста. Весь стёртый текст пишется в `--removed`. Фигуры, маркеры списка и поля-флажки Word превращаются в `☐` + метка новыми видами правок, если бланку это нужно. XML правится через `xml.dom.minidom`, чтобы префиксы пространств имён остались как были.
  - `docx.py passes <clean.docx> <a.docx> <b.docx>` — A: у прогонов-меток кегль 1 pt (`w:sz` = 2); B: текст меток стёрт. Если метка не равна всему тексту своего прогона — ошибка с номером абзаца.
  - `osascript -l JavaScript scripts/blanks/find-text.js <file.pdf>` → JSON `{ pages, markers: [{ page, text, x, y, w }], boxes: [{ page, x, y, w, h }] }`: каждое `{{…}}` и каждый `☐` в порядке `page.string`, координаты PDF (левый нижний угол первого символа).
  - `node scripts/blanks/make-form.mjs <clean.docx> <out.pdf> <fields.ts>`:
    1. `passes`, затем `soffice --headless --convert-to pdf` для A и B;
    2. `find-text` по A и B; ошибка, если число страниц A, B и `<Pages>` из `docProps/app.xml` разное, если на странице число `☐` в B не равно числу меток флажков в A или если имя метки повторяется;
    3. на B поля по правилам раздела «Как Word-бланк становится PDF-формой». Текстовые — `createTextField(cell).addToPage(page, { x, y, width, height, borderWidth: 0, borderColor: undefined, backgroundColor: undefined })`, затем `acroField.setDefaultAppearance("/Helv 0 Tf 0 g")` (автоматический кегль: `setFontSize(0)` pdf-lib не принимает), при H ≥ 20 — `enableMultiline()`. Флажки — `createCheckBox(tick)` размером с рамку глифа, без рамки и фона;
    4. B загружается с `{ updateMetadata: false }`; удаляются `/Info` и `/Metadata`; сохранение с `{ updateFieldAppearances: false }` (иначе pdf-lib впишет в DA вычисленный кегль);
    5. пишет `fields.ts`: `// Generated by scripts/blanks/make-form.mjs from <clean.docx>. Do not edit.` и `export default { text: [...], boxes: [...] } as const`.
  - Анкеты `pl-s` «Польша С» (presets purpose tourism, hostKind hotel) и `pl-guest-s` «Польша гости С» (tourism, person) на `fromFields("blanks/pl-c.pdf", plC)`, NUMBERING_B, country PL — первыми в `QUESTIONNAIRES`. Так «Польша С» становится анкетой по умолчанию.

- [ ] **Step 1:** `brew install --cask libreoffice`; `soffice --version` (или `/Applications/LibreOffice.app/Contents/MacOS/soffice --version`) печатает версию.
- [ ] **Step 2:** Написать `docx.py`, `find-text.js`, `make-form.mjs` по контрактам выше.
- [ ] **Step 3: Чистый бланк:** `dump` образца `ПОЛЬША С.docx`, правки, `apply` → `blanks-src/pl-c.docx`. Метки для всех полей, которые печатает `printedText` и в которых бланк просит значение; для всех вариантов выбора, средств и `sponsorOther`. Затем `dump` чистого бланка: замаскированных значений не осталось, кроме напечатанных слов бланка.
- [ ] **Step 4:** `make-form` → `public/blanks/pl-c.pdf`, `src/lib/blanks/pl-c.fields.ts`. Рендер пустой формы и сверка (порядок, шаг 4).
- [ ] **Step 5: Failing test:** зарегистрировать `pl-s`, `pl-guest-s`; `npm test`. Если общий тест падает (нет метки, не тот ключ), поправить метки и собрать форму заново до PASS.
- [ ] **Step 6: Глазами:** рендер заполненной `<tmp>/pl-c.pdf`.
- [ ] **Step 7: README:** раздел «Города и бланки других стран» заменить разделом «Как добавить бланк»:
  - где лежат исходники, PDF-формы и описания;
  - синтаксис меток;
  - команды `dump` / `apply` / `make-form`;
  - что стирается в образце (значения, отметки, `docProps`, `customXml`, колонтитулы, картинки кроме логотипов);
  - проверка утечек и рендером;
  - как зарегистрировать анкету и города (`cities.ts`);
  - что LibreOffice нужен только разработчику;
  - правило про файлы с персональными данными: никогда не коммитятся и не копируются в проект.
- [ ] **Step 8: Проверка утечек** `blanks-src/pl-c.docx` и `public/blanks/pl-c.pdf` против `ПОЛЬША С.docx` и `ПОЛЬША ГОСТИ С.docx`: 0 находок. `npm test && npm run build && npm run lint`.
- [ ] **Step 9: Commit.**

---

### Task 6: Бланк «Венгрия тур»

Шаги — «Порядок для одного бланка» выше; образец `ВЕНГРИЯ ТУР.docx`.

**Files:**
- Create: `blanks-src/hu.docx`, `public/blanks/hu.pdf`, `src/lib/blanks/hu.fields.ts`
- Modify: `src/lib/questionnaire.ts`, при необходимости `scripts/blanks/docx.py` (новый вид правки)

**Interfaces:**
- Consumes: `make-form`, `docx.py`, `fromFields` (Task 5).
- Produces: анкета `{ id: "hu", label: "Венгрия тур", country: "HU", blank: fromFields("blanks/hu.pdf", …), items: NUMBERING_A, presets: { purpose: "tourism", hostKind: "hotel" } }` в конце `QUESTIONNAIRES`.

- [ ] **Step 1:** Чистый бланк `blanks-src/hu.docx` (`dump` → правки → `apply`), `make-form`, рендер пустой формы и сверка.
- [ ] **Step 2: Failing test:** регистрация анкеты; `npm test` падает, пока форма не собрана правильно; правка меток и пересборка до PASS.
- [ ] **Step 3: Глазами:** рендер заполненной `<tmp>/hu.pdf`.
- [ ] **Step 4:** Проверка утечек против `ВЕНГРИЯ ТУР.docx` (0 находок); `npm test && npm run build && npm run lint`.
- [ ] **Step 5: Commit.**

---

### Task 7: Бланк «Греция тур»

Шаги — «Порядок для одного бланка» выше; образец `ГРЕЦИЯ ТУР.docx`.

**Files:**
- Create: `blanks-src/gr.docx`, `public/blanks/gr.pdf`, `src/lib/blanks/gr.fields.ts`
- Modify: `src/lib/questionnaire.ts`, при необходимости `scripts/blanks/docx.py` (новый вид правки)

**Interfaces:**
- Consumes: `make-form`, `docx.py`, `fromFields` (Task 5).
- Produces: анкета `{ id: "gr", label: "Греция тур", country: "GR", blank: fromFields("blanks/gr.pdf", …), items: NUMBERING_B, presets: { purpose: "tourism", hostKind: "hotel" } }` в конце `QUESTIONNAIRES`.

- [ ] **Step 1:** Чистый бланк `blanks-src/gr.docx` (`dump` → правки → `apply`), `make-form`, рендер пустой формы и сверка.
- [ ] **Step 2: Failing test:** регистрация анкеты; `npm test` падает, пока форма не собрана правильно; правка меток и пересборка до PASS.
- [ ] **Step 3: Глазами:** рендер заполненной `<tmp>/gr.pdf`.
- [ ] **Step 4:** Проверка утечек против `ГРЕЦИЯ ТУР.docx` (0 находок); `npm test && npm run build && npm run lint`.
- [ ] **Step 5: Commit.**

---

### Task 8: Бланк «Испания»

Шаги — «Порядок для одного бланка» выше; образец `ИСПАНИЯ.docx`; старая испанская анкета удалена в Task 2.

**Files:**
- Create: `blanks-src/es.docx`, `public/blanks/es.pdf`, `src/lib/blanks/es.fields.ts`
- Modify: `src/lib/questionnaire.ts`, при необходимости `scripts/blanks/docx.py` (новый вид правки)

**Interfaces:**
- Consumes: `make-form`, `docx.py`, `fromFields` (Task 5).
- Produces: анкета `{ id: "es", label: "Испания", country: "ES", blank: fromFields("blanks/es.pdf", …), items: NUMBERING_A, presets: { purpose: "tourism", hostKind: "hotel" } }` в конце `QUESTIONNAIRES`.

- [ ] **Step 1:** Чистый бланк `blanks-src/es.docx` (`dump` → правки → `apply`), `make-form`, рендер пустой формы и сверка.
- [ ] **Step 2: Failing test:** регистрация анкеты; `npm test` падает, пока форма не собрана правильно; правка меток и пересборка до PASS.
- [ ] **Step 3: Глазами:** рендер заполненной `<tmp>/es.pdf`.
- [ ] **Step 4:** Проверка утечек против `ИСПАНИЯ.docx` (0 находок); `npm test && npm run build && npm run lint`.
- [ ] **Step 5: Commit.**

---

### Task 9: Бланк «Италия»

Шаги — «Порядок для одного бланка» выше; образец `ИТАЛИЯ.docx`; поля-флажки Word заменить на `☐` + метка (новая правка в `docx.py`).

**Files:**
- Create: `blanks-src/it.docx`, `public/blanks/it.pdf`, `src/lib/blanks/it.fields.ts`
- Modify: `src/lib/questionnaire.ts`, при необходимости `scripts/blanks/docx.py` (новый вид правки)

**Interfaces:**
- Consumes: `make-form`, `docx.py`, `fromFields` (Task 5).
- Produces: анкета `{ id: "it", label: "Италия", country: "IT", blank: fromFields("blanks/it.pdf", …), items: NUMBERING_A, presets: { purpose: "tourism", hostKind: "hotel" } }` в конце `QUESTIONNAIRES`.

- [ ] **Step 1:** Чистый бланк `blanks-src/it.docx` (`dump` → правки → `apply`), `make-form`, рендер пустой формы и сверка.
- [ ] **Step 2: Failing test:** регистрация анкеты; `npm test` падает, пока форма не собрана правильно; правка меток и пересборка до PASS.
- [ ] **Step 3: Глазами:** рендер заполненной `<tmp>/it.pdf`.
- [ ] **Step 4:** Проверка утечек против `ИТАЛИЯ.docx` (0 находок); `npm test && npm run build && npm run lint`.
- [ ] **Step 5: Commit.**

После Task 9 `QUESTIONNAIRES` идут в порядке `pl-s, pl-guest-s, pl-guest-d, pl-kp, pl-work, bg, hu, gr, es, it`. В итоге для владельца — что открыть: по одной анкете на каждый из семи бланков.
