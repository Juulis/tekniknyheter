# Tekniknyheter

Bot-driven tekniknyhetssida med **redaktionell prioritering**.

- **Frontend:** https://juulis.github.io/tekniknyheter/
- **API:** https://tekniknyheter.vercel.app
- **Repo:** https://github.com/Juulis/tekniknyheter

## Redaktionell prio (Juulis)

Prioritera **positiva** nyheter inom:

- Tesla
- Elbilar
- Elon Musk
- NVIDIA / Jensen Huang
- Elon Musks bolag (Tesla, xAI, SpaceX, Neuralink, m.fl.)
- Geopolitiska tekniknyheter (lag/AI-regler m.m.)
- AI

Negativt brus i samma ämnen har lägre prio.

### Hur det är implementerat

| Lager | Beteende |
| --- | --- |
| `api/_lib/editorial.js` | Tags, sentiment-heuristik, `priorityScore`, topic-lista |
| `GET /api/news` | Default `editorial=1&positive=1&sort=priority` |
| `POST /api/ingest` | Auto-taggar; `strictEditorial: true` eller header `X-Strict-Editorial: 1` avvisar lågprio/negativt |
| Frontend | Visar tags, sorterar på redaktionell prio, kategorier från prio-ämnen |

Ingest-tips till nyhetsboten: skicka gärna `tags`, `sentiment: "positive"` och `priority: true` när det passar.

## API i korthet

```bash
curl "https://tekniknyheter.vercel.app/api/news?editorial=1&positive=1&sort=priority"
```

```bash
curl -X POST "https://tekniknyheter.vercel.app/api/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_API_KEY" \
  -H "X-Strict-Editorial: 1" \
  -d '{"title":"Tesla ...","summary":"...","source":"Bot","sentiment":"positive"}'
```

## Deploy

- Pages: GitHub Actions (`.github/workflows/pages.yml`)
- API: Vercel-projekt `tekniknyheter` (team juuffy), auto-deploy från `main`
- Sätt `INGEST_API_KEY` i Vercel env om den saknas
