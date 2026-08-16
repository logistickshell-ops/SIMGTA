# Render deployment — Urban Flux

## Причина ошибки

Репозиторий содержит `pnpm-lock.yaml`, но в Render Build Command был указан `npm install && npm run build`. Это смешивает два package manager. Дополнительно `pnpm-workspace.yaml` был некорректным: вместо обязательного поля `packages` он содержал служебный `allowBuilds` с текстовым значением.

## Исправление файлов

1. Удалить `pnpm-workspace.yaml`, так как проект не является workspace.
2. Добавить в `package.json`:

```json
"packageManager": "pnpm@10.4.1",
"engines": { "node": ">=22 <25" }
```

Готовый diff находится в `SIMGTA-render-fix.patch` рядом с этим документом.

## Настройки Render Static Site

| Поле | Значение |
| --- | --- |
| Runtime | Node |
| Node Version | `22.13.0` или версия из `.nvmrc` |
| Build Command | `pnpm install --frozen-lockfile && pnpm build` |
| Publish Directory | `dist` |
| Start Command | не нужен для Static Site |

Если Render автоматически устанавливает зависимости до Build Command, достаточно указать Build Command `pnpm build`; однако явная команда с `--frozen-lockfile` надёжнее и гарантирует использование lock-файла.

После применения изменений нужно сделать новый commit/push в `main` и нажать Manual Deploy → Deploy latest commit в Render. В логе ожидается `pnpm install` и затем `vite build`; команды `npm install` быть не должно.
