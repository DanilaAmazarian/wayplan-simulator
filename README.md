# wayplan-simulator

Планировщик путешествий с ИИ. Укажите город, количество дней и интересы — сервис составит маршрут по дням, уточнит координаты мест по OpenStreetMap, выстроит оптимальный порядок посещения и покажет всё на интерактивной карте.

## Возможности

- **Генерация маршрута ИИ.** Структурированный план по дням: места с описанием, типом, временем посещения и способом передвижения. Провайдеры — Cursor SDK или OpenAI, плюс демо-режим без внешних запросов.
- **Уточнение координат.** Каждое место проверяется через геокодер [Nominatim](https://nominatim.org/) (OpenStreetMap). На карточках видно, какие координаты подтверждены (`OSM`), а какие предложены ИИ (`≈ ИИ`).
- **Оптимизация порядка.** Точки дня сортируются по географической близости (алгоритм ближайшего соседа), временные слоты сохраняются.
- **Двухпанельный интерфейс.** Слева — таймлайн по дням, справа — карта Leaflet с нумерованными маркерами и линией маршрута в цвете дня.
- **Мои маршруты.** Сохранение, переименование, повторное открытие и удаление поездок. Ссылка вида `/?trip=<id>` открывает конкретный маршрут.

## Стек

| Часть | Технологии |
|---|---|
| `shared/` | Общие TypeScript-типы (`Trip`, `DayPlan`, `ItineraryItem`, `Location`, …) |
| `backend/` | Node.js, Express 5, Prisma 7, SQLite, Cursor SDK / OpenAI SDK |
| `frontend/` | Angular 22, Taiga UI 5, Leaflet |

Монорепозиторий на npm workspaces, весь код — TypeScript.

## Быстрый старт

Требуется Node.js 22.22.3+ или 24.15+ (Angular 22 не стартует на более ранних версиях).

```bash
# 1. Зависимости для всех пакетов
npm install

# 2. Настройки бэкенда
cp backend/.env.example backend/.env
# укажите CURSOR_API_KEY или OPENAI_API_KEY, либо OPENAI_MOCK=1 для демо-режима

# 3. База данных
cd backend
npx prisma migrate dev
npx prisma generate
cd ..

# 4. Запуск — в двух терминалах
npm run dev:backend    # API на http://localhost:4000
npm run dev:frontend   # интерфейс на http://localhost:3000
```

## Запуск в Docker

```bash
cp backend/.env.example backend/.env   # ключи ИИ-провайдера, как и для локального запуска
docker compose up --build -d
```

- Интерфейс: http://localhost:3000, API: http://localhost:4000.
- Если порты заняты, задайте другие: `FRONTEND_PORT=3100 BACKEND_PORT=4100 docker compose up --build -d` (в PowerShell — через `$env:FRONTEND_PORT=3100` перед командой). Адрес API встраивается во фронтенд при сборке (`API_URL`), поэтому после смены `BACKEND_PORT` нужен `--build`.
- База SQLite хранится в томе `backend-data` и переживает пересоздание контейнеров. Миграции применяются автоматически при старте бэкенда.
- Ключи из `backend/.env` передаются в контейнер как переменные окружения и в образ не попадают.
- Остановить: `docker compose down`; удалить вместе с базой: `docker compose down -v`.

## Настройки

### Бэкенд (`backend/.env`)

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Путь к SQLite, по умолчанию `file:./dev.db` |
| `PORT` | Порт API, по умолчанию `4000` |
| `LLM_PROVIDER` | `cursor` или `openai`. Если пусто — выбирается по наличию ключей |
| `CURSOR_API_KEY`, `CURSOR_MODEL` | Ключ Cursor API и модель (`composer-2.5`) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Ключ OpenAI и модель (`gpt-4o-mini`) |
| `OPENAI_MOCK` | `1` — демо-маршрут по Риму без обращения к ИИ |
| `GEOCODER_ENABLED` | `0` — отключить уточнение координат через Nominatim |
| `NOMINATIM_USER_AGENT` | User-Agent с контактом — требование политики Nominatim |

### Фронтенд

Адрес API задаётся в [`frontend/src/environments/environment.ts`](frontend/src/environments/environment.ts) (`apiUrl`, по умолчанию `http://localhost:4000`). В Docker то же значение приходит аргументом сборки `API_URL`.

## API

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/health` | Проверка работоспособности |
| `POST` | `/api/trips/generate` | Сгенерировать и сохранить поездку: `{ destination, durationDays, preferences? }` |
| `GET` | `/api/trips` | Список поездок; `?saved=true` — только сохранённые |
| `GET` | `/api/trips/:id` | Поездка целиком |
| `PATCH` | `/api/trips/:id` | Переименовать или сохранить: `{ title?, saved? }` |
| `DELETE` | `/api/trips/:id` | Удалить поездку вместе с точками |

Ошибки возвращаются в формате `{ "error": "..." }`. Код `429` означает исчерпанный лимит ИИ-провайдера.

## Как устроена генерация

1. ИИ получает запрос и возвращает план строго по JSON-схеме.
2. Ответ проверяется и очищается от некорректных точек.
3. Геокодер Nominatim уточняет координаты: сначала находит город, затем ищет «место, город» и «адрес, город» в его границах. Не чаще одного запроса в секунду, с кешем; результаты дальше 50 км от города отбрасываются.
4. Точки каждого дня переупорядочиваются по близости.
5. Поездка сохраняется в SQLite и возвращается клиенту.

## Структура

```
shared/            общие типы
backend/
  prisma/          схема и миграции БД
  src/routes/      HTTP-роуты
  src/services/    генерация, геокодер, кластеризация, работа с БД
frontend/
  src/app/core/http/     базовый URL и разбор ошибок HTTP
  src/app/pages/planner/ страница: форма, таймлайн, карта Leaflet, список маршрутов, signal-store
  src/environments/      адрес API
```

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev:backend` | API в режиме наблюдения за файлами |
| `npm run dev:frontend` | Angular dev-сервер |
| `npm run typecheck` | Проверка типов во всех пакетах |
| `npm run prisma:studio --workspace backend` | Просмотр БД в браузере |
