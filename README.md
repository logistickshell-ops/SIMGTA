# Urban Flux — Criminal City Builder

Игровой клиент Urban Flux: смесь градостроительного симулятора и криминального action-режима в стилистике GTA 2.

## Запуск

```bash
pnpm install
pnpm dev
```

Production-сборка:

```bash
pnpm build
pnpm preview
```

Проверки:

```bash
pnpm test
pnpm check
```

## Содержимое

`src/game/` содержит игровое ядро, симуляцию города, NPC, транспорт, дорожный граф, A* автопилот, спрос зон, энергосеть и localStorage-сохранение. `src/components/` и `src/pages/` содержат минимальный HUD и экран игры.

## Исключено из slim-архива

Серверный шаблон, авторизация, база данных, S3-обвязка, аналитика, шаблонные dashboard-компоненты, `node_modules`, `dist`, логи, `.git` и `.env`-файлы. Внешние графические ассеты используются через стабильные Manus Storage URL, поэтому локальные бинарные файлы не требуются.
