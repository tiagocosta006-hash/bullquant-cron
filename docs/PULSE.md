# Pulse — analytics first-party

Analytics próprio, self-hosted na stack existente (Postgres + Next.js).
Zero custo, zero dependências externas, zero cookies.

## Como funciona

- **Cliente**: `lib/pulse/client.ts` exporta `track(type, meta?)` (sendBeacon
  com fallback `fetch keepalive`; nunca lança). `components/pulse/PulseTracker.tsx`
  (montado no root layout) envia um `pageview` por navegação e converte cliques
  em elementos com `data-track="nome"` em eventos `cta_click` — as páginas
  server (landing) não precisam de client components para instrumentar CTAs.
- **Servidor**: `POST /api/track` valida (Zod), deriva país/dispositivo/sessão
  dos headers e grava em `pulse_events`. Responde **sempre 204** — analytics
  nunca parte UX. Server actions (ex.: signup) usam `recordServerEvent` de
  `lib/pulse/server.ts` diretamente.
- **Dashboard**: `/analytics` (grupo app), restrito à allowlist
  `ANALYTICS_ADMIN_EMAILS` (emails separados por vírgula); fora da lista → 404.
- **Rate limit**: bucket próprio `track` (60/min/IP) no `proxy.ts`.

## Tipos de evento

`pageview` · `cta_click` (meta: `{cta}`) · `signup` · `dcf_saved` (meta:
`{ticker}`) · `watchlist_add` (meta: `{ticker}`). Novos tipos: acrescentar a
`PULSE_EVENT_TYPES` em `lib/pulse/server.ts` (o Zod e o TS seguem).

## Privacidade (GDPR)

- **Sem cookies nem localStorage** — nada guardado no browser.
- **O IP nunca é persistido.** O `sessionId` é `sha256(diaUTC|salt|ip|ua)`
  truncado — roda diariamente, portanto sessões de dias diferentes não são
  correlacionáveis e o hash não é reversível. Salt em `PULSE_SALT` (env).
- **DNT e Global Privacy Control honrados** no cliente e no servidor.
- **Bots filtrados** por user-agent (`isBot`).
- `referrer` só é guardado quando é externo ao site.
- **Retenção sugerida: 180 dias.** Purge manual (automatizar com cron quando
  justificar):
  ```sql
  DELETE FROM pulse_events WHERE "createdAt" < now() - interval '180 days';
  ```

## Env vars

```env
PULSE_SALT=                 # salt do hash de sessão (qualquer string aleatória)
ANALYTICS_ADMIN_EMAILS=     # emails com acesso a /analytics, separados por vírgula
```
