<p align="center">
  <img src="projects/Zuik-frontend/src/assets/zuik-logo.png" width="80" alt="Zuik Logo" />
</p>

<h1 align="center">Zuik</h1>

<p align="center">
  <strong>Intent-Based DeFi Automation on Algorand</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Algorand-TestNet-000?style=flat-square&logo=algorand" alt="Algorand" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
</p>

<p align="center">
  <code>voice</code> · <code>text</code> · <code>drag & drop</code> · <code>AI-powered</code> · <code>non-custodial</code> · <code>atomic execution</code>
</p>

<p align="center">
  Describe what you want in plain language, draw it with visual blocks, or speak it out loud.<br/>
  Zuik builds the workflow and executes it on Algorand — all-or-nothing, sub-5s finality.
</p>

---

## How It Works

<p align="center">
  <img src="docs/how-it-works.png" alt="How It Works" width="800" />
</p>

> **Step 1** — Describe your intent via voice, text, or by dragging blocks onto the canvas.  
> **Step 2** — Zuik simulates the workflow: fee breakdown, slippage estimates, safety warnings.  
> **Step 3** — Sign once. Atomic transaction groups execute on Algorand with sub-5s finality.

---

## Features

| | Feature | What It Does |
|-|---------|-------------|
| **AI** | Intent Engine | Describe trades in plain English; AI generates the full workflow. Powered by Groq (Llama 3.3 70B). |
| **Voice** | Conversation Mode | Talk to Zuik hands-free — describe strategies, ask for advice, or command changes. |
| **Visual** | Flow Builder | 30+ drag-and-drop blocks across triggers, actions, logic, notifications, and DeFi. |
| **Safety** | Transaction Simulation | Every workflow is simulated before signing. See fees, slippage, and warnings upfront. |
| **Execution** | Atomic Groups | All-or-nothing transaction groups. If any step fails, everything rolls back. |
| **Alerts** | Telegram Bot | Monitor workflows, check balances, and receive alerts with interactive inline buttons. |
| **Fiat** | On/Off-Ramp | Buy crypto with INR/USD/EUR or cash out to your bank via Saber Money. |

---

## Architecture

<p align="center">
  <img src="docs/architecture.png" alt="Architecture" width="800" />
</p>

> Open [`docs/architecture-diagram.html`](docs/architecture-diagram.html) in a browser to view the interactive animated version. Right-click each canvas to save as PNG.

---

## Quick Start

### Prerequisites

| Tool | Install |
|------|---------|
| **Node.js** 20+ | [nodejs.org](https://nodejs.org) |
| **npm** 9+ | Comes with Node.js |

### Setup

```bash
git clone https://github.com/DarshanKrishna-DK/Zuik.git
cd Zuik/projects/Zuik-frontend
npm install
cp .env.template .env
```

Set your keys in `.env`:

| Variable | Source |
|----------|--------|
| `VITE_GROQ_API_KEY` | Free at [console.groq.com/keys](https://console.groq.com/keys) |
| `VITE_SUPABASE_URL` | Free at [supabase.com](https://supabase.com) |
| `VITE_SUPABASE_ANON_KEY` | Supabase project settings |
| `VITE_TELEGRAM_BOT_TOKEN` | Via [@BotFather](https://t.me/BotFather) |

> Algorand TestNet node URLs are pre-configured via [Nodely](https://nodely.io) free tier.

```bash
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** and connect your wallet (Pera, Defly, or Exodus) on TestNet.

> Free TestNet ALGO: [Algorand Dispenser](https://dispenser.testnet.aws.algodev.network/)

### Server Agent

```bash
cd server && npm install && npx tsx agent.ts
```

Handles persistent operations: Telegram bot, price monitoring, scheduled execution, and notifications.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Algorand TestNet via [Nodely](https://nodely.io) |
| **Frontend** | React 18, Vite 5, TypeScript |
| **Flow Editor** | [@xyflow/react](https://reactflow.dev) v12 |
| **Wallet** | [@txnlab/use-wallet](https://github.com/TxnLab/use-wallet) |
| **AI Engine** | [Groq](https://groq.com) — Llama 3.3 70B |
| **Voice** | Web Speech API |
| **DEX** | [Folks Router](https://folksrouter.io) + [Tinyman](https://tinyman.org) |
| **Fiat** | [Saber Money](https://docs.saber.money) |
| **Database** | [Supabase](https://supabase.com) |
| **Notifications** | Telegram Bot API + Discord |
| **Server** | Node.js + tsx |

---

## Project Structure

```
Zuik/
├── projects/Zuik-frontend/          React + Vite + React Flow
│   ├── src/
│   │   ├── components/flow/         GenericNode, Sidebar, ChatPanel, etc.
│   │   ├── lib/                     Block registry, executors, intent materializer
│   │   ├── services/                Algorand txns, DEX, AI parser, Supabase
│   │   ├── pages/                   Landing, Builder, Dashboard, Settings
│   │   └── styles/                  Global CSS with design tokens
│   └── public/
├── server/                          Node.js agent (Telegram, price monitor)
├── docs/                            Architecture diagrams
└── ZUIK_DEVELOPMENT_PLAN.md         Development roadmap
```

---

## License

MIT

---

<p align="center">
  <strong>Built for <a href="https://www.algohackseries.com/">AlgoHackSeries 3.0</a></strong><br/>
  <sub>Intent-Based DeFi Automation on Algorand</sub>
</p>
