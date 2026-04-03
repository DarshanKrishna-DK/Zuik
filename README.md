<p align="center">
  <img src="Zuik_Logo.png" alt="Zuik" width="140" />
</p>

<h1 align="center">Zuik</h1>

<p align="center">
  <strong>Intent-Based DeFi Automation on Algorand</strong>
</p>

<p align="center">
  Describe what you want in plain language, draw it with visual blocks, or speak it out loud.<br/>
  Zuik builds the workflow and executes it on Algorand.
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
  │    to ALGO and       │  Swap  │─▶│  Send  │   signs and    │
  │    send to X"        │  Token │  │Payment │   submits      │
  │         │            └────────┘  └────────┘       │        │
  │         ▼                                         ▼        │
  │    Intent Engine      Visual Flow Builder    Algorand      │
  │    parses text        shows what happens     blockchain    │
  │    into actions       before you sign        confirms tx   │
  │                                                            │
  ╰────────────────────────────────────────────────────────────╯
```

> **Voice, text, or drag blocks** → Zuik translates that into a workflow → **Review → Sign → Execute**

---

## Quick Start

### What You Need

| Tool | Why | Install |
|:-----|:----|:--------|
| **Node.js** 20+ | Runs the frontend | [nodejs.org](https://nodejs.org) |
| **npm** 9+ | Installs packages | Comes with Node.js |
| **Python** 3.12+ | Smart contracts tooling | [python.org](https://www.python.org/downloads/) |
| **AlgoKit CLI** 2+ | Algorand developer toolkit | [Install guide](https://github.com/algorandfoundation/algokit-cli#install) |
| **Docker** (optional) | Only needed for LocalNet | [docker.com](https://www.docker.com/) |

### Steps to Run

**1. Clone the repository**

```bash
git clone https://github.com/DarshanKrishna-DK/Zuik.git
cd Zuik
```

**2. Install frontend dependencies**

```bash
cd projects/Zuik-frontend
npm install
```

**3. Set up your environment file**

Copy the template and fill in your keys:

```bash
cp .env.template .env
```

Open `.env` and update these values:

| Variable | What It Is | Where to Get It |
|:---------|:-----------|:----------------|
| `VITE_GROQ_API_KEY` | AI intent engine key | Free at [console.groq.com/keys](https://console.groq.com/keys) |
| `VITE_SABER_CLIENT_ID` | Fiat on/off-ramp (optional) | From Saber Money representative |
| `VITE_SABER_CLIENT_SECRET` | Fiat on/off-ramp (optional) | From Saber Money representative |

The Algorand TestNet node URLs are pre-filled using [Nodely](https://nodely.io) free tier. No changes needed unless you want to use a different provider.

**4. Start the development server**

```bash
npm run dev
```

**5. Open in your browser**

Go to **http://localhost:5173**

You will see the landing page. Click **Open Builder** to access the visual workflow editor.

### Connect Your Wallet

1. Click the **Connect Wallet** button in the top right corner
2. Choose your wallet (Pera, Defly, or Exodus)
3. Make sure your wallet is set to **Algorand TestNet**
4. Approve the connection in your wallet app

> You need TestNet ALGO to execute transactions. Get free TestNet ALGO from the [Algorand Dispenser](https://dispenser.testnet.aws.algodev.network/).

### Try It Out

**Drag and Drop (Visual Builder)**
1. Open the Builder page
2. Drag blocks from the left sidebar onto the canvas
3. Connect blocks by drawing edges between them
4. Configure each block by clicking on it
5. Press the **Run** button to execute the workflow

**AI Assistant (Natural Language)**
1. Click the **AI** button in the top right of the Builder toolbar
2. Type something like "Swap 10 ALGO to USDC" or use the microphone for voice input
3. Zuik will generate the workflow blocks automatically
4. Review the generated flow, then run it

---

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Blockchain** | Algorand TestNet via [Nodely](https://nodely.io) free tier |
| **Smart Contracts** | Algorand Python (Puya compiler) |
| **Frontend** | React 18, Vite 5, TypeScript |
| **Flow Editor** | [@xyflow/react](https://reactflow.dev) v12 |
| **Wallet** | [@txnlab/use-wallet](https://github.com/TxnLab/use-wallet) (Pera, Defly, Exodus) |
| **SDK** | [AlgoKit Utils](https://github.com/algorandfoundation/algokit-utils-ts) v9 |
| **DEX** | [Folks Router](https://folksrouter.io) aggregator API |
| **Fiat On/Off-Ramp** | [Saber Money](https://docs.saber.money) Sandbox APIs |
| **AI Intent Engine** | [Groq](https://groq.com) with Llama 3.3 70B (free tier, JSON mode) |
| **Voice Input** | Web Speech API (browser native) |
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
│   │   │   │   │                     TransactionPanel, AgentControls,
│   │   │   │   │                     ExecutionLog, ChatPanel
│   │   │   │   └── layout/           Navbar
│   │   │   ├── lib/
│   │   │   │   ├── executors/        Trigger, Logic, Notification executors
│   │   │   │   ├── blockRegistry.ts  30 block definitions across 5 categories
│   │   │   │   ├── runAgent.ts       Flow execution engine
│   │   │   │   ├── intentMaterializer.ts
│   │   │   │   ├── flowSerializer.ts Save / load / export flows
│   │   │   │   └── connectionValidator.ts
│   │   │   ├── services/             Algorand transactions, Saber Money,
│   │   │   │                         AI intent parser
│   │   │   ├── pages/                Landing, Builder, Dashboard, Settings
│   │   │   └── utils/                Algorand client config helpers
│   │   └── public/                   Logo, favicon
│   │
│   └── Zuik-contracts/               Algorand Python smart contracts
│       └── smart_contracts/          Contract source code and artifacts
```

---

## Block Categories

| Category | Count | Examples |
|:---------|:-----:|:---------|
| **Triggers** | 4 | Timer Loop, Wallet Event, Webhook, Telegram |
| **Actions** | 9 | Swap Token, Send Payment, Opt-In ASA, Create ASA, HTTP Request, Fiat On-Ramp, Fiat Off-Ramp |
| **Logic** | 9 | Comparator, Delay, Math, Filter, Rate Limiter, Merge, Constant |
| **Notifications** | 3 | Send Telegram, Send Discord, Browser Notification |
| **DeFi** | 5 | Price Monitor, Liquidity Pool Info, Portfolio Balance, Get Quote, Fiat Price Quote |

**30 blocks total** that you can drag onto the canvas, connect, configure, and run.

---

## Using LocalNet Instead of TestNet

If you want to develop against a local Algorand network:

1. Make sure Docker is running
2. Start LocalNet: `algokit localnet start`
3. Open `projects/Zuik-frontend/.env`
4. Comment out the TestNet section
5. Uncomment the LocalNet section
6. Restart the dev server with `npm run dev`

---

## License

This project is built for [AlgoHackSeries 3.0](https://www.algohackseries.com/).
