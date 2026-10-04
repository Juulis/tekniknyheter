# Tekniknyheter

Bot-driven tekniknyhetssida med **redaktionell prioritering**.

- **Frontend:** https://juulis.github.io/tekniknyheter/
- **API:** https://tekniknyheter.vercel.app
- **Repo:** https://github.com/Juulis/tekniknyheter

## Prioriterade ämnen

Redaktionell prio ligger på:

- Tesla
- Elbilar
- Elon Musk
- NVIDIA / Jensen Huang
- Elon Musks bolag (Tesla, xAI, SpaceX, Neuralink, m.fl.)
- Geopolitiska tekniknyheter (lag/AI-regler m.m.)
- AI

Brus i samma ämnen (skvaller, eventlistor, kursspekulation) har lägre prio.

### Hur det är implementerat

| Lager | Beteende |
| --- | --- |
| `api/_lib/editorial.js` | Tags, rankningsregler, `priorityScore`, topic-lista |
| `GET /api/news` | Default `editorial=1&positive=1&sort=priority` |
| `POST /api/ingest` | Auto-taggar; `strictEditorial: true` eller header `X-Strict-Editorial: 1` avvisar lågprio |
| Frontend | Visar tags, sorterar på redaktionell prio, kategorier från prio-ämnen |

Ingest-tips till nyhetsboten: skicka gärna `tags` och `priority: true` när det passar.

## Rankning och kluster

- **Standardläge (`positive=1`):** urvalet rankas efter redaktionell prio; lågprioriterat hamnar sist men göms inte.
- **Toppnyheter-läge (`positive=only`):** strikt urval, bara de högst prioriterade nyheterna returneras.
- **Kluster:** nära-dubbletter slås ihop till en primär nyhet med `alsoIn: [{ source, url, title }]` (max 3 andra utgivare, bara upplösta utgivar-URL:er). Frontend visar dem som "Också i: Källa1, Källa2".
- **Urval av de 40:** mjuk kategorikvotering: minst 2 per kärnkategori (Tesla, Elbilar, NVIDIA, SpaceX, Neuralink, AI, Geopolitik) och minst 4 svenska kort om kandidater finns, därefter högst ~25 % per kategori innan fyllning.
- **Rankning:** starka nyheter i kärnämnena får extra poäng; primärkällor (tesla.com, nvidia.com, spacex.com, x.ai, neuralink.com, IR/newsroom, Reuters/AP) och svenska källor får en liten bonus. Politiskt "slam", eventlistor/webinars och kryptospådomar utesluts; kursspekulation ("price prediction", "could hit") väljs bara om det saknas annat. Privatliv/skvaller viktas kraftigt ned.
- **Kluster:** utöver titellikhet (Jaccard 0,3 med samma kategori och nyckelentitet) slås nyheter ihop på entitet + händelse (t.ex. NVIDIA + all-time high, Tesla + leveranser Q3, Tesla + Supercharger-flyktläge).
- **Geopolitik:** bara chip/exportkontroll, AI-lagar och EV-regler/tullar (högst 4 kort); övrig EU/Kina-politik får ingen Geopolitik-tagg och faller bort.
- **Bilder:** samma sidhämtning som ger og:description ger og:image (absolut https, cache per id); frontend byter trasiga bilder mot kategori-placeholder.
- **Frontend:** reglaget "Toppnyheter" byter anropet till toppnyheter-läge (`positive=only`) och sparas i URL-param `?top=1` och localStorage (äldre länkar fungerar också); urvalet på 40 görs då bland de högst prioriterade nyheterna.
- **Sammanfattning:** utgivarens egen `og:description`/meta description (ingen LLM, ingen översättning). Hittas ingen lämnas `summary` tom och kortet visas utan sammanfattning.
- **Google News-länkar** löses upp till utgivar-URL:er vid refresh (cache i serverminnet; `maxDuration` 30 s i `vercel.json`). Cron-jobbet kör upp till två omgångar för att förvärma.

## Statistik (besöksräknare utan cookies)

- Frontend anropar `POST /api/hit` en gång per sidvisning (`hit.js`, `fetch` med `keepalive`, ingen cookie/localStorage). Skickas: `utm_source` (sanerad `a-z0-9_-`, max 32), referrer-värdnamn (sökvägen skickas men sparas inte). Ingen IP, ingen User-Agent och inga persondata sparas.
- Lagring: privat Vercel Blob-store `tekniknyheter-stats` (`BLOB_READ_WRITE_TOKEN` i Vercel). En JSON-fil per dag (`stats/YYYY-MM-DD.json`, dag i Europe/Stockholm) plus `stats/total.json`. Skrivning sker med ETag (`ifMatch`) och upp till 10 omförsök, så samtidiga träffar tappar normalt ingen räkning; vid extrem burst kan enstaka träffar missas.
- Ignoreras: `DNT: 1`, User-Agent med bot/crawl/spider/headless/preview m.fl., och webbläsar-anrop från annan Origin än `https://juulis.github.io`.
- Läs siffrorna: `GET https://tekniknyheter.vercel.app/api/stats` (publik, bara aggregerat, CORS `*`) -> `{ total, today, since, days: [{ date, views, bySource, byRef }] (30 dagar), bySourceTotal }`. Länka med `?utm_source=youtube`.
- Av/på i frontend: `hits: false` i `config.js`. Begränsningar: adblock kan blockera anropet, botar utan bot-UA räknas, och direktanrop utan Origin (t.ex. curl) går att räkna.

## API i korthet

```bash
curl "https://tekniknyheter.vercel.app/api/news?editorial=1&positive=1&sort=priority"
```

```bash
curl -X POST "https://tekniknyheter.vercel.app/api/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_API_KEY" \
  -H "X-Strict-Editorial: 1" \
  -d '{"title":"Tesla ...","summary":"...","source":"Bot","tags":["Tesla"]}'
```

## Deploy

- Pages: GitHub Actions (`.github/workflows/pages.yml`)
- API: Vercel-projekt `tekniknyheter` (team juuffy), auto-deploy från `main`
- Sätt `INGEST_API_KEY` i Vercel env om den saknas
