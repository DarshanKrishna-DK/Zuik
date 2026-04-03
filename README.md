<p align="center">
  <img src="Zuik_Logo.png" alt="Zuik" width="140" />
</p>

<h1 align="center">Zuik</h1>

<p align="center">
  <strong>Intent-Based DeFi Automation on Algorand</strong>
</p>

<p align="center">
  Describe what you want in plain language — or drag visual blocks.<br/>
  Zuik builds the workflow and executes it atomically on-chain.
</p>

<p align="center">
  <a href="#how-it-works">How It Works</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#project-structure">Structure</a>
</p>

---

## How It Works

```
  ╭────────────────────────────────────────────────────────────╮
  │                                                            │
  │    ① Describe          ② Review           ③ Execute        │
  │                                                            │
  │   "Swap 50 USDC     ┌────────┐  ┌────────┐   Wallet       │
  │    to ALGO and       │  Swap  │─▶│  Send  │   signs &      │
  │    send to X"        │  Token │  │Payment │   submits      │
  │         │            └────────┘  └────────┘       │        │
  │         ▼                                         ▼        │
  │    Intent Engine      Visual Flow Builder    Algorand      │
  │    parses text        shows what happens     blockchain    │
  │    into actions       before you sign        confirms tx   │
  │                                                            │
  ╰────────────────────────────────────────────────────────────╯
```

> **Voice / text / drag blocks** → Zuik translates to a workflow → **Simulate → Sign → Execute**

---

## Quick Start

```bash
# Clone
git clone https://github.com/DarshanKrishna-DK/Zuik.git
cd Zuik/projects/Zuik-frontend

# Install
npm install

# Configure testnet environment
cp .env.testnet .env

# Run
npm run dev
```

---

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Blockchain** | Algorand TestNet via [Nodely](https://nodely.io) free tier |
| **Smart Contracts** | Algorand Python (Puya compiler) |
| **Frontend** | React 18 · Vite 5 · TypeScript |
| **Flow Editor** | [@xyflow/react](https://reactflow.dev) v12 |
| **Wallet** | [@txnlab/use-wallet](https://github.com/TxnLab/use-wallet) — Pera · Defly · Exodus |
| **SDK** | [AlgoKit Utils](https://github.com/algorandfoundation/algokit-utils-ts) v9 |
| **DEX** | [Folks Router](https://folksrouter.io) aggregator API |
| **Icons** | [Lucide React](https://lucide.dev) |

---

## Project Structure

```
Zuik/
├── projects/
│   ├── Zuik-frontend/                React + Vite + React Flow
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── flow/             GenericNode, Sidebar, BlockInputs,
│   │   │   │   │                     TransactionPanel, AgentControls, ExecutionLog
│   │   │   │   └── layout/           Navbar
│   │   │   ├── lib/
│   │   │   │   ├── executors/        Trigger, Logic, Notification executors
│   │   │   │   ├── blockRegistry.ts  27 block definitions across 5 categories
│   │   │   │   ├── runAgent.ts       Flow execution engine
│   │   │   │   ├── flowSerializer.ts Save / load / export flows
│   │   │   │   └── connectionValidator.ts
│   │   │   ├── services/             Algorand tx services (swap, send, opt-in, create ASA)
│   │   │   ├── pages/                Landing, Builder, Dashboard, Settings
│   │   │   └── utils/                Algorand client config helpers
│   │   └── public/                   Logo, favicon
│   │
│   └── Zuik-contracts/               Algorand Python smart contracts
│       └── smart_contracts/          Add via `algokit generate smart-contract`
```

---

## Block Categories

| Category | Count | Examples |
|:---------|:-----:|:---------|
| **Triggers** | 4 | Timer Loop · Wallet Event · Webhook · Telegram |
| **Actions** | 7 | Swap Token · Send Payment · Opt-In ASA · Create ASA · HTTP Request |
| **Logic** | 9 | Comparator · Delay · Math · Filter · Rate Limiter · Merge · Constant |
| **Notifications** | 3 | Send Telegram · Send Discord · Browser Notification |
| **DeFi** | 4 | Price Monitor · Liquidity Pool Info · Portfolio Balance · Get Quote |

**27 blocks total** — drag onto the canvas, connect, configure, and run.

---

## Development Status

| Phase | Status |
|:------|:------:|
| **0** Foundation & Scaffolding | ✅ |
| **1** Visual Flow Builder | ✅ |
| **2** Algorand Transaction Engine | ✅ |
| **3** Triggers, Logic & Agent Runtime | ✅ |
| **4** Conversational Interface & Intent Engine | ⏳ |
| **5** Simulation, Explanation & Safety | ⏳ |
| **6** Persistence, Dashboard & Monitoring | ⏳ |
| **7** API Layer & Agent-Driven Finance | ⏳ |
| **8** Polish, Testing & Submission | ⏳ |

---

## License

This project is built for **[AlgoHackSeries 3.0](https://www.algohackseries.com/)**.

<p align="center">
  <sub>Built with ☕ on Algorand</sub>
</p>
