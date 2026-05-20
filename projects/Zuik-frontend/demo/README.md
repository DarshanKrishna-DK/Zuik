# Zuik stakeholder demo automation

Playwright-based browser automation for live presentations. Each command opens Zuik in Chromium, walks through the UI with smooth cursor highlights, natural typing delays, and on-screen step banners.

## Quick start

From `projects/Zuik-frontend/`:

```bash
npm install
npm run demo:install
cp demo/demo.config.example.json demo/demo.config.json
# Configure .env.local (Groq, Supabase, network) as for normal dev
npm run demo:ai-workflow
```

Demos default to **headed** mode (visible browser) and **auto-start** the Vite dev server. Set `DEMO_START_SERVER=false` if the app is already running.

## Story-driven demo flow

Run these in order for a cohesive narrative (or use `demo:full` for the complete story):

| Step | Command | What it shows |
|------|---------|----------------|
| 1 | `npm run demo:ai-workflow` | AI generates a simple wallet-trigger workflow on the builder |
| 2 | `npm run demo:ai-edit` | AI extends the canvas to multi-agent / multi-trigger automation |
| 3 | `npm run demo:guardian` | Settings: Guardian on-chain daily spend limits |
| 4 | `npm run demo:logicsig` | Settings: LogicSig automation permissions |
| **All** | `npm run demo:full` | Landing, all four chapters, dashboard finale |

**Optional:** `npm run demo:trading` - Market explorer to prefilled swap workflow (uses safe navigation that avoids `networkidle` hangs).

| Command | Description |
|---------|-------------|
| `npm run demo:help` | CLI usage |

## Prerequisites

1. **Node 20+** and frontend dependencies (`npm install`).
2. **Playwright Chromium**: `npm run demo:install` (once per machine).
3. **`.env.local`** aligned with your target network (testnet or mainnet):
   - `VITE_SERVER_URL` and server `GROQ_API_KEY` for AI workflow demos (optional fallback: templates).
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for delegation persistence.
   - `VITE_GUARDIAN_APP_ID` / `VITE_GUARDIAN_APP_ADDRESS` for Guardian demo.
4. **Wallet** (Pera, Defly, or LocalNet KMD) for flows that sign transactions.

## Configuration

Copy `demo/demo.config.example.json` to `demo/demo.config.json` and adjust scenario text (no secrets in this file).

| Variable | Description |
|----------|-------------|
| `DEMO_BASE_URL` | App URL (default `http://localhost:5173`) |
| `DEMO_START_SERVER` | Start `npm run dev` if true |
| `DEMO_HEADLESS` | Headless browser |
| `DEMO_SLOW_MO` | Playwright slow motion (ms) |
| `DEMO_SKIP_WALLET` | Skip wallet wait (UI-only) |
| `DEMO_WALLET_PROVIDER` | `kmd` or `pera` auto-select in modal |
| `DEMO_WALLET_WAIT_MS` | Max wait for connect (default 120000) |
| `DEMO_GUARDIAN_AGENT_ADDRESS` | Agent address for Guardian register step |
| `DEMO_AI_INTENT` | Override Step 1 AI prompt |
| `DEMO_AI_EDIT_INTENT` | Override Step 2 AI edit prompt |

Screenshots are saved under `demo/screenshots/` (gitignored).

## Wallet handling

When a demo needs a connected wallet:

1. The script opens the **Connect Wallet** modal.
2. A banner asks you to approve in your extension.
3. The demo continues after connection or times out with recovery hints.

For **LocalNet**: set `DEMO_WALLET_PROVIDER=kmd` and use the LocalNet wallet option.

For **presentation-only** (no signing): `DEMO_SKIP_WALLET=true`.

## Network support

Demos read the same `VITE_ALGOD_NETWORK` and API endpoints as the app. Use `.env.local` for testnet or mainnet; do not hardcode addresses in the demo package. Guardian and delegation steps detect missing configuration and explain what to set.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Server did not become ready` | Free port 5173 or set `DEMO_BASE_URL` to your running instance |
| Demo hangs on Market page | Fixed in latest demos (`domcontentloaded` instead of `networkidle`) |
| `Wallet connection timed out` | Connect manually, increase `DEMO_WALLET_WAIT_MS`, or `DEMO_SKIP_WALLET=true` |
| AI panel shows warning | Start the Zuik server with `GROQ_API_KEY` and set `VITE_SERVER_URL` in `.env.local` |
| Guardian banner "not available" | Deploy Guardian and set `VITE_GUARDIAN_APP_ID` |
| Delegation needs Supabase | Set Supabase env vars or use `DEMO_SKIP_WALLET` for UI tour |
| Element not found | Ensure latest frontend; demos use `data-testid` hooks |
| Chromium missing | Run `npm run demo:install` |

## Architecture

```
demo/
  run.ts              CLI entry
  demo.config.json    Local scenario overrides (optional)
  src/
    config.ts         Env + JSON config loader
    navigation.ts     Safe page loads (no networkidle hangs)
    server.ts         Vite lifecycle
    runner.ts         Browser session + screenshots
    wallet.ts         Connect flow
    visual/           Cursor overlay + presenter
    demos/
      builder-shared.ts  Shared AI builder steps
      ai-workflow.ts     Step 1
      ai-edit.ts         Step 2
      guardian.ts        Step 3
      logicsig.ts        Step 4
      trading.ts         Optional market segment
      full.ts            Complete story
```

Extend by adding a file under `src/demos/`, registering it in `run.ts`, and an npm script in `package.json`.
