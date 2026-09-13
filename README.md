# Tekniknyheter

Skal till en tekniknyhetssida.

- **Frontend:** statisk sajt för [GitHub Pages](https://pages.github.com/)
- **Backend:** serverless API på [Vercel](https://vercel.com/)
- **Innehåll:** en annan bot kan skicka in nyheter via `POST /api/ingest`

Repo: https://github.com/Juulis/tekniknyheter

## Struktur

```
/
  index.html      # Pages-frontend
  styles.css
  app.js
  config.js       # apiBaseUrl till Vercel
  api/
    news.js       # GET  /api/news
    ingest.js     # POST /api/ingest
    _lib/store.js # tillfällig lagring + exempeldata
  vercel.json
```

## 1. Aktivera GitHub Pages

1. Öppna **Settings → Pages** i repot
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Spara — sajten landar på `https://juulis.github.io/tekniknyheter/`

## 2. Deploya API till Vercel

1. Importera repot i Vercel
2. Lägg till miljövariabeln `INGEST_API_KEY` (valfritt starkt lösenord/token)
3. Deploy
4. Uppdatera `config.js` med din Vercel-URL, t.ex.:

```js
window.TEKNIKNYHETER_CONFIG = {
  apiBaseUrl: 'https://tekniknyheter.vercel.app',
};
```

## API

### `GET /api/news`

Returnerar `{ items: NewsItem[], generatedAt }`.

### `POST /api/ingest`

Header: `X-Ingest-Key: <INGEST_API_KEY>`

Body (ett objekt eller `{ items: [...] }`):

```json
{
  "title": "Rubrik",
  "summary": "Kort text",
  "url": "https://exempel.se/artikel",
  "source": "Nyhetsbot",
  "publishedAt": "2026-09-13T20:00:00.000Z"
}
```

Exempel:

```bash
curl -X POST "https://DIN-VERCEL-URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_API_KEY" \
  -d '{"title":"Test","summary":"Från boten","source":"Nyhetsbot"}'
```

## Obs om lagring

`api/_lib/store.js` är **tillfällig** (minne per serverless-instans) med seed-data. Bra för skalet — byt till t.ex. Vercel KV / databas innan produktion.

## Nästa steg

1. Sätt Pages + Vercel
2. Koppla nyhetsboten till `/api/ingest`
3. Byt till hållbar lagring
