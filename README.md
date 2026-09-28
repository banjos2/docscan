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

## Пустой бланк анкеты

`public/anketa-template.pdf` получен из заполненного `ANKETA.pdf` скриптом
`scripts/make_template.py` (нужен PyMuPDF: `pip install pymupdf`), который вырезает из PDF
наложенный слой с ответами, оставляя чистую форму:

```bash
python scripts/make_template.py ~/Downloads/ANKETA.pdf public/anketa-template.pdf
```

Файл с реальными персональными данными (`~/Downloads/ANKETA.pdf` или любой заполненный экземпляр)
никогда не коммитится и не должен использоваться нигде, кроме этой команды.

## Шрифт

VK Sans Display — корпоративный шрифт VK. Перед публичным деплоем проверьте условия его лицензии.
