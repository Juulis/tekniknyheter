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

## Rankning, tonläge och kluster

- **`positive=1` (standard) betyder "positiv lutning", inte filter:** positiva nyheter rankas först, neutrala får finnas kvar och tydligt negativa hamnar sist (de göms inte).
- **`positive=only` är strikt:** bara nyheter med `sentiment === 'positive'` returneras (neutrala och negativa utesluts).
- **Positiv ton** kräver positiva signalord i rubriken. Kritik/konflikt ("challenges", "slams" ...) och privatliv/skvaller (separation, dejting m.m.) ger aldrig positiv ton; skvaller får dessutom aldrig `editorialPriority` och viktas kraftigt ned.
- **Kluster:** nära-dubbletter slås ihop till en primär nyhet med `alsoIn: [{ source, url, title }]` (max 3 andra utgivare, bara upplösta utgivar-URL:er). Frontend visar dem som "Också i: Källa1, Källa2".
- **Urval av de 40:** mjuk kategorikvotering: minst 2 per kärnkategori (Tesla, Elbilar, NVIDIA, SpaceX, Neuralink, AI, Geopolitik) och minst 4 svenska kort om kandidater finns, därefter högst ~25 % per kategori innan fyllning.
- **Rankning:** starka positiva nyheter i kärnämnena får extra poäng; primärkällor (tesla.com, nvidia.com, spacex.com, x.ai, neuralink.com, IR/newsroom, Reuters/AP) och svenska källor får en liten bonus. Politiskt "slam", eventlistor/webinars och kryptospådomar utesluts; kursspekulation ("price prediction", "could hit") väljs bara om det saknas annat.
- **Kluster:** utöver titellikhet (Jaccard 0,35 med samma kategori och nyckelentitet) slås nyheter ihop på entitet + händelse (t.ex. NVIDIA + all-time high, Tesla + leveranser Q3, Tesla + Supercharger-flyktläge).
- **Frontend:** reglaget "Bara positiva" byter anropet till `positive=only` (sparas i URL-param `?positive=only` och localStorage); urvalet på 40 görs då bland bara positiva nyheter.
- **Sammanfattning:** utgivarens egen `og:description`/meta description (ingen LLM, ingen översättning). Hittas ingen lämnas `summary` tom och kortet visas utan sammanfattning.
- **Google News-länkar** löses upp till utgivar-URL:er vid refresh (cache i serverminnet; `maxDuration` 30 s i `vercel.json`). Cron-jobbet kör upp till två omgångar för att förvärma.

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
