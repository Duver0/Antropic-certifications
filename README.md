# Anthropic Skilljar Certificate Tracker

A static single-page application that displays all Anthropic Skilljar certificates.  
Built with **Astro**, **Tailwind CSS v4**, and **Playwright** — powered by **Bun**.

🌐 Live site: <https://Duver0.github.io/Antropic-certifications>

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)

## Setup

```bash
# 1. Install dependencies
bun install

# 2. Install the Playwright Chromium browser (required for the scraper)
bunx playwright install chromium
```

## Environment variables

| Variable            | Description                     |
| ------------------- | ------------------------------- |
| `SKILLJAR_EMAIL`    | Your Anthropic Skilljar e-mail  |
| `SKILLJAR_PASSWORD` | Your Anthropic Skilljar password |

Create a `.env` file (never commit it!):

```bash
SKILLJAR_EMAIL=you@example.com
SKILLJAR_PASSWORD=supersecret
```

## Scripts

| Command            | Description                                     |
| ------------------ | ----------------------------------------------- |
| `bun run scrape`   | Scrape certificates → `data/certificates.json`  |
| `bun run dev`      | Start Astro dev server                          |
| `bun run build`    | Build static site into `dist/`                  |
| `bun run preview`  | Preview the built site locally                  |

### Full local workflow

```bash
# Scrape certificates (requires SKILLJAR_EMAIL + SKILLJAR_PASSWORD)
SKILLJAR_EMAIL=you@example.com SKILLJAR_PASSWORD=secret bun run scrape

# Start the dev server
bun run dev

# Build for production
bun run build

# Preview the production build
bun run preview
```

## Deployment (GitHub Actions)

The workflow at `.github/workflows/deploy.yml` runs automatically on every push
to `main` and every Monday at 08:00 UTC.

Add the following secrets to your repository (**Settings → Secrets → Actions**):

- `SKILLJAR_EMAIL`
- `SKILLJAR_PASSWORD`

The workflow will:
1. Scrape the latest certificates
2. Build the static site with Astro
3. Deploy the `dist/` folder to GitHub Pages

## Project structure

```
.
├── .github/workflows/deploy.yml   # CI/CD pipeline
├── data/certificates.json          # Scraped certificate data
├── public/favicon.svg
├── src/
│   ├── components/CertCard.astro   # Certificate card component
│   ├── pages/index.astro           # Main page
│   ├── scripts/scrape.ts           # Playwright scraper
│   ├── styles/global.css           # Tailwind v4 CSS entry point
│   └── types/certificate.ts        # TypeScript interface
├── astro.config.mjs
├── bunfig.toml
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```