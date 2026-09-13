# Tekniknyheter

Bot-driven tekniknyhetssida.

- **Frontend:** statisk sajt på [GitHub Pages](https://pages.github.com/) via GitHub Actions
- **Backend:** serverless API på [Vercel](https://vercel.com/)
- **Innehåll:** en annan bot skickar in nyheter via `POST /api/ingest`

Repo: https://github.com/Juulis/tekniknyheter  
Förväntad Pages-URL: https://juulis.github.io/tekniknyheter/

## Funktioner i skalet

- Nyhetskort med kategori, källa, relativ tid
- Sök + kategorifilter + sortering (nyast / äldst / titel)
- Delbara URL:er: `?q=ai&category=AI&sort=newest`
- Dark/light-läge (sparat i `localStorage`)
- Skeleton loading, tom-/fel-lägen, sample-data utan API

## Struktur

```
/
  index.html
  styles.css
  app.js
  config.js                 # apiBaseUrl till Vercel
  favicon.svg / robots.txt / sitemap.xml
  .github/workflows/pages.yml
  api/
    news.js                 # GET  /api/news?q=&category=&sort=
    ingest.js               # POST /api/ingest
    _lib/store.js           # tillfällig lagring + seed
  vercel.json
```

## 1. GitHub Pages (Actions)

Pages ska vara satt till **GitHub Actions**. Workflowen `.github/workflows/pages.yml` deployar frontend-filerna vid push till `main`.

Sajt: `https://juulis.github.io/tekniknyheter/`

## 2. Vercel (API)

1. Importera `Juulis/tekniknyheter` i Vercel
2. Sätt miljövariabeln `INGEST_API_KEY`
3. Deploy
4. Uppdatera `config.js`:

```js
window.TEKNIKNYHETER_CONFIG = {
  apiBaseUrl: 'https://DIN-VERCEL-URL',
};
```

## API

### `GET /api/news`

Query (valfritt): `q`, `category`, `sort` (`newest` | `oldest` | `title`)

Svar:

```json
{
  "items": [],
  "total": 0,
  "filtered": 0,
  "query": { "q": "", "category": null, "sort": "newest" },
  "generatedAt": "..."
}
```

### `POST /api/ingest`

Header: `X-Ingest-Key: <INGEST_API_KEY>`

```json
{
  "title": "Rubrik",
  "summary": "Kort text",
  "url": "https://exempel.se/artikel",
  "source": "Nyhetsbot",
  "category": "AI",
  "publishedAt": "2026-09-13T20:00:00.000Z"
}
```

Även array eller `{ "items": [...] }` fungerar.

```bash
curl -X POST "https://DIN-VERCEL-URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_API_KEY" \
  -d '{"title":"Test","summary":"Från boten","source":"Nyhetsbot","category":"AI"}'
```

## Lagring

`api/_lib/store.js` är **tillfällig** (minne per serverless-instans) + seed-data. Byt till Vercel KV / databas innan produktion.

## Nästa steg

1. Klara Vercel-deploy + `config.js`
2. Koppla nyhetsboten till `/api/ingest`
3. Hållbar lagring
