# DocScan

Фото паспорта или ID-карты → распознавание MRZ прямо в браузере → анкета для шенгенской визы,
проверенная и заполненная в PDF. Backend отсутствует: фото, OCR-модели и готовый PDF никогда не
покидают устройство.

## Запуск

```bash
npm install
sh scripts/fetch_assets.sh   # модели OCR и WASM-рантайм — большие бинарники, не в git
npm run dev
```

Другие команды: `npm test` (юнит-тесты), `npm run build` (проверка типов + сборка), `npm run lint`.

Форматы фото: JPG, PNG, WebP и HEIC. HEIC с iPhone конвертируется в JPEG прямо в браузере
библиотекой `heic-to` (libheif, LGPL-3.0); её ~3 МБ загружаются, только когда пришёл HEIC-файл.

`scripts/fetch_assets.sh` идемпотентен: уже скачанные файлы он не трогает, можно запускать
повторно.

## Деплой

Пошаговая инструкция для Railway: [docs/deploy-railway.md](docs/deploy-railway.md). Для любого
другого Docker-хостинга подойдут те же `Dockerfile` и `Caddyfile`.

Задеплоенный сайт закрыт страницей входа (`public/login.html`): Caddy пускает дальше только с cookie, ключ которой есть
в переменной `AUTH_KEYS`. Ключ для email и пароля печатает `sh scripts/auth-key.sh`; без `AUTH_KEYS` контейнер не
запустится. `npm run dev` вход не проверяет.

## Пустой бланк анкеты

`public/anketa-template.pdf` получен из заполненного `ANKETA.pdf` скриптом
`scripts/make_template.py` (нужен PyMuPDF: `pip install pymupdf`), который вырезает из PDF
наложенный слой с ответами, оставляя чистую форму:

```bash
python scripts/make_template.py ~/Downloads/ANKETA.pdf public/anketa-template.pdf
```

Файл с реальными персональными данными (`~/Downloads/ANKETA.pdf` или любой заполненный экземпляр)
никогда не коммитится и не должен использоваться нигде, кроме этой команды.

## Города и бланки других стран

Города подачи лежат в `src/lib/cities.ts`: у каждого русское название для списка (`ru`) и название для печати на языке
бланка (`print`). Бланк новой страны — это файл в `src/lib/templates/`, его строка в `TEMPLATES` (`src/lib/template.ts`) и
список городов этой страны в `cities.ts`. Координаты проверяются на глаз, по картинкам страниц:
`osascript -l JavaScript scripts/render-pdf-page.js <файл.pdf> <папка> 0 1 2 3`. Для польского и греческого бланков вместо
Helvetica понадобится Unicode-шрифт (см. «Потом» в `docs/superpowers/specs/2026-10-31-questionnaire-templates-design.md`).

## Шрифт

VK Sans Display — корпоративный шрифт VK. Перед публичным деплоем проверьте условия его лицензии.
