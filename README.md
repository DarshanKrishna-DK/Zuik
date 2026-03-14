<p align="center">
  <img src="Zuik_Logo.png" alt="Zuik" width="120" />
</p>

<h1 align="center">Zuik</h1>

<p align="center">
  <strong>Intent-Based DeFi Automation on Algorand</strong>
</p>

<p align="center">
  Describe what you want — Zuik builds the workflow and executes it on-chain.
</p>

---

## How It Works

```
                         ┌──────────────────┐
                         │    User Intent    │
                         │ "Swap 50 USDC to  │
                         │  ALGO and send to │
                         │  wallet X"        │
                         └────────┬─────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │      Intent Engine          │
                    │  (NLP / Voice → Structured) │
                    └─────────────┬──────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   Visual Workflow Builder    │
                    │                              │
                    │  ┌───────┐    ┌───────┐     │
                    │  │ Swap  │───▶│ Send  │     │
                    │  │ Token │    │Payment│     │
                    │  └───────┘    └───────┘     │
                    │                              │
                    │  Users can also build flows  │
                    │  manually by dragging blocks │
                    └─────────────┬──────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   Simulate & Explain         │
                    │  • Expected output: ~48 ALGO │
                    │  • Fees: 0.004 ALGO          │
                    │  • Atomic group: all-or-none │
                    └─────────────┬──────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   Wallet Signs & Executes    │
                    │   (Pera / Defly / Exodus)    │
                    └─────────────┬──────────────┘
                                  │
                         ┌────────▼─────────┐
                         │    Algorand       │
                         │    Blockchain     │
                         └──────────────────┘
```

---

## Project Structure

```
Zuik/
├── projects/
│   ├── Zuik-frontend/          React + Vite + React Flow
│   │   ├── src/
│   │   │   ├── components/     UI components (flow nodes, sidebar, layout)
│   │   │   ├── lib/            Block registry, serializer, validators
│   │   │   ├── pages/          Landing, Builder, Dashboard, Settings
│   │   │   └── utils/          Algorand client config
│   │   └── public/             Logo, favicon
│   │
│   └── Zuik-contracts/         Algorand Python smart contracts
│       └── smart_contracts/    Add contracts with `algokit generate smart-contract`
│
├── ZUIK_DEVELOPMENT_PLAN.md    Phase-wise build plan
└── AGENTS.md                   AI agent guidelines
```

---

## Quick Start

```bash
# 1. Clone and navigate
git clone https://github.com/<your-username>/Zuik.git
cd Zuik/projects/Zuik-frontend

# 2. Install dependencies
npm install

# 3. Configure environment
#    Copy .env.template to .env and set Nodely testnet values
#    (or use .env.testnet which is pre-configured)
cp .env.testnet .env

# 4. Run
npm run dev
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Algorand (TestNet via Nodely) |
| Smart Contracts | Algorand Python (Puya) |
| Frontend | React · Vite · TypeScript |
| Flow Editor | @xyflow/react (React Flow) |
| Wallet | @txnlab/use-wallet (Pera, Defly, Exodus) |
| SDK | AlgoKit Utils TS |

---

<p align="center">
  Built for <strong>AlgoHackSeries 3.0</strong>
</p>
