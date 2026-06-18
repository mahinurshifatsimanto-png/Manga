# মাঙ্গা বাংলা অনুবাদক — Manga Bengali Translator

AI-powered Japanese-to-Bengali manga translator. Upload a manga page, Gemini Vision
detects every speech bubble, translates it into colloquial Bengali, and the browser
overlays the translation directly onto the original image using HTML5 Canvas —
masking the Japanese text and rendering Bengali in its place using the Baloo Da 2 font.

## Stack

- Static frontend: HTML / CSS / vanilla JS (no build step, no framework)
- Backend: single Netlify serverless function (`netlify/functions/translate.js`)
- AI: Google Gemini 1.5 Flash (multimodal vision)
- Font: Baloo Da 2 (Google Fonts, Bengali-optimized)

## Deploy to Netlify

### 1. Get a Gemini API key
Go to https://aistudio.google.com/app/apikey and generate a key.

**Important:** never put the key in any frontend file or commit it to git. It is read
server-side only, inside the Netlify Function, from an environment variable.

### 2. Push this folder to a Git repo
```bash
git init
git add .
git commit -m "manga bengali translator"
git remote add origin <your-repo-url>
git push -u origin main
```

### 3. Connect to Netlify
- New site from Git → pick your repo
- Build settings are already defined in `netlify.toml`:
  - Publish directory: `public`
  - Functions directory: `netlify/functions`
- Click Deploy

### 4. Set the environment variable
In Netlify dashboard → Site configuration → Environment variables → Add variable:
- Key: `GEMINI_API_KEY`
- Value: your Gemini key from step 1

Redeploy after adding the variable (Netlify → Deploys → Trigger deploy).

### 5. Done
Your site is live at `https://<your-site-name>.netlify.app`. No further config needed.

## Local development

```bash
npm install -g netlify-cli
npm install
netlify dev
```

Create a `.env` file locally (never commit it) with:
```
GEMINI_API_KEY=your_key_here
```

`netlify dev` runs the function locally on the same port as the static site, so
`fetch('/.netlify/functions/translate')` works identically to production.

## File structure

```
/
├── netlify.toml                    # Netlify build + function config
├── package.json                    # node-fetch dependency for the function
├── public/                         # Static site (publish directory)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── netlify/
    └── functions/
        └── translate.js            # Serverless Gemini proxy
```

## How it works

1. User drags/selects a manga page image (JPG/PNG/WEBP, max 8MB)
2. Browser converts it to base64, sends to `/.netlify/functions/translate`
3. The function calls Gemini 1.5 Flash with the image + a structured prompt asking for:
   - every text element's bounding box (as % of image dimensions)
   - bubble shape (ellipse / rect / cloud / none)
   - the Bengali translation, font size, weight, alignment
4. Gemini returns structured JSON
5. The browser draws the original image on a `<canvas>`, then for each detected
   element: masks the original bubble with a white shape, fits the Bengali text to
   the bubble bounds (auto-shrinking font size if needed), and renders it in
   Baloo Da 2
6. User can download the result as a PNG or copy all translations as plain text

## Notes

- Sound effects (GONK, RUSTLE, OW, etc.) are intentionally left untranslated —
  Gemini is instructed to keep them in Roman script, matching common scanlation practice
- The bounding-box accuracy depends entirely on Gemini's vision output — dense pages
  with overlapping bubbles may need a manual nudge in a future version (not included
  here, since the brief asked for a working first deploy)
