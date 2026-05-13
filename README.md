# Sovereign Voice Lite

Mobile-first React + TypeScript demo for AI-powered Indian document intelligence.

## Run locally

```bash
npm install
npm run dev
```

## API keys

Create `.env.local` and add:

```bash
SARVAM_API_KEY=your_key
VITE_SARVAM_API_KEY=your_key
```

`VITE_SARVAM_API_KEY` keeps local Vite development simple. In production, Vercel functions use `SARVAM_API_KEY` server-side so the browser does not call Sarvam directly.

The demo mode works without an API key using a synthetic sample Aadhaar-style document. Real document analysis uses Sarvam Document Intelligence, and Q&A uses Sarvam chat completions.

## Deploy

For Netlify, the included `netlify.toml` publishes `dist` after `npm run build`.
For Vercel, use the Vite defaults: build command `npm run build`, output directory `dist`, and add `SARVAM_API_KEY` in Project Settings -> Environment Variables.
