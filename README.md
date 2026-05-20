<p align="center">
  <img src="projects/Zuik-frontend/src/assets/zuik-logo.png" width="88" alt="Zuik" />
</p>

<h1 align="center">Zuik</h1>

<p align="center">
  <strong>The First Intent-Based DeFi Automation Tool on Algorand: describe goals in plain language, review a visual workflow, sign with your wallet.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Algorand-Powered-000?style=for-the-badge&logo=algorand&logoColor=white" alt="Algorand" />
  <img src="https://img.shields.io/badge/Non--Custodial-Your%20Keys-34D399?style=for-the-badge" alt="Non-Custodial" />
  <img src="https://img.shields.io/badge/Atomic-All%20or%20Nothing-A78BFA?style=for-the-badge" alt="Atomic Execution" />
  <img src="https://img.shields.io/badge/Voice%20%7C%20Text%20%7C%20Visual-00E5FF?style=for-the-badge" alt="Multimodal Input" />
</p>

<p align="center">
  Set up <strong>$X weekly dollar-cost averaging into ALGO</strong>, alert yourself when prices move, or rebalance - by voice, chat, or drag-and-drop.
</p>

<p align="center">
  <a href="#overview"><strong>Overview</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="#getting-started"><strong>Get started</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="#developer-setup"><strong>Run locally</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="#architecture"><strong>Architecture</strong></a>
</p>

---

## Table of contents

<details open>
<summary><strong>Jump to a section</strong></summary>

**Product**

- [Overview](#overview)
- [User journey](#user-journey)
- [Capabilities and use cases](#capabilities-and-use-cases)

**Technical deep dive**

- [Architecture](#architecture)
- [Workflow creation](#workflow-creation)
- [Smart contracts](#smart-contracts)
  - [Contract interaction flow](#contract-interaction-flow)
  - [ZuikGuardian](#zuikguardian)
  - [Delegation verifier and LogicSig](#delegation-verifier-and-logicsig)
  - [TestNet deployment](#testnet-deployment)
- [Technology and integrations](#technology-and-integrations)

**Build and run**

- [Getting started](#getting-started)
- [Developer setup](#developer-setup)
  - [Prerequisites](#prerequisites)
  - [Clone and install](#clone-and-install)
  - [Environment configuration](#environment-configuration)
  - [Running the project](#running-the-project)
- [Development workflow](#development-workflow)

**Trust**

- [Security and trust](#security-and-trust)
- [License](#license)

</details>

---

## Overview

Most people want outcomes - steady investing, recurring payments, price alerts - not another dashboard to babysit. Zuik turns those goals into reviewable, wallet-signed workflows without scripts or manual monitoring.

Zuik is an intent-based DeFi automation platform on Algorand. You describe what you want; AI and visual tools turn that into a clear workflow you review and approve.

## USP

**Governed AI automation:** AI agents can go rogue or act outside intended limits. Zuik addresses this with reviewable workflows before signing, on-chain Guardian spending caps, and LogicSig delegation rules so automation stays bounded and wallet controlled.

| Pain point | How Zuik helps |
|------------|----------------|
| Complexity across wallets, DEXs, and spreadsheets | One intent engine and visual builder for the full flow |
| Manual price monitoring and rebalancing | Scheduled triggers and condition-based automation |
| Technical barriers to scripting bots | Natural language, voice, and drag-and-drop blocks |
| Unclear fees and risk before signing | Safety preview with fee estimates and on-chain limits |
| Missed off-hours opportunities | Optional cloud agent for 24/7 schedules and alerts |

**Live on Algorand TestNet:** Guardian contract deployed and wired into Settings. Swaps route through Tinyman on TestNet and Folks Router where available.

---

## User journey

```mermaid
flowchart LR
    subgraph INPUT["1. Describe"]
        V["Voice"]
        T["Chat"]
        B["Visual builder"]
    end

    subgraph ZUIK["2. Review"]
        INTENT["Intent engine"]
        FLOW["Workflow builder"]
        CHECK["Safety preview"]
    end

    subgraph EXECUTE["3. Approve and automate"]
        SIGN["Wallet signature"]
        ATOMIC["Atomic transaction group"]
        TRACK["Dashboard and alerts"]
    end

    V --> INTENT
    T --> INTENT
    B --> FLOW
    INTENT --> FLOW
    FLOW --> CHECK
    CHECK --> SIGN
    SIGN --> ATOMIC
    ATOMIC --> TRACK

    style INPUT fill:#1a1040,stroke:#a78bfa,color:#f8fafc
    style ZUIK fill:#0a1a2a,stroke:#00e5ff,color:#f8fafc
    style EXECUTE fill:#0a2018,stroke:#34d399,color:#f8fafc
```

You stay non-custodial throughout: Zuik orchestrates, your wallet signs, and multi-step flows run as atomic transaction groups on Algorand.

---

## Capabilities and use cases

| Capability | Examples |
|------------|----------|
| **Multimodal input** | Voice, chat, and a 34-block visual flow builder |
| **Non-custodial execution** | Wallet-signed transactions; assets stay in your control |
| **Atomic groups** | Multi-step trades succeed together or not at all |
| **DEX connectivity** | Tinyman direct pools and Folks Router aggregation |
| **On-chain safety** | Guardian daily caps and LogicSig delegation with verifier apps |
| **Cloud agent** | Background schedules, price monitors, and Telegram alerts |
| **Persistence** | Supabase-backed workflows and run history |
| **Trading and investing** | Weekly DCA, conditional swaps on price drops, take-profit flows |
| **Scheduled payments** | Recurring sends to any Algorand address, payroll-style batches |
| **Portfolio management** | Rebalancing, yield routing, auto-allocate incoming stablecoin deposits |
| **Monitoring** | Threshold alerts to Telegram or Discord, multi-asset watchlists |

---

## Architecture

```mermaid
graph TB
    subgraph USERS["Users"]
        WEB["Web application"]
        TG["Telegram"]
        VOICE["Voice"]
    end

    subgraph PLATFORM["Zuik platform"]
        INTENT["Intent and advisor"]
        BUILDER["Flow builder"]
        EXEC["Workflow engine"]
        SAFE["Safety and limits"]
    end

    subgraph PERSIST["Persistence"]
        DB["Supabase workflows and history"]
    end

    subgraph AGENT["Cloud agent optional"]
        SCHED["Schedules"]
        PRICE["Price monitors"]
        NOTIFY["Notifications"]
    end

    subgraph ALGORAND["Algorand"]
        WALLET["Your wallet"]
        SWAPS["Tinyman and Folks Router"]
        GUARD["ZuikGuardian and delegation verifier"]
    end

    WEB --> INTENT
    VOICE --> INTENT
    TG --> INTENT
    INTENT --> BUILDER
    BUILDER --> EXEC
    EXEC --> SAFE
    SAFE --> WALLET
    EXEC --> SWAPS
    SAFE --> GUARD
    EXEC --> DB
    AGENT --> EXEC
    AGENT --> DB
    AGENT --> ALGORAND
    WALLET --> ALGORAND

    style USERS fill:#1a1040,stroke:#a78bfa,color:#f8fafc
    style PLATFORM fill:#0a1a2a,stroke:#00e5ff,color:#f8fafc
    style AGENT fill:#2a1020,stroke:#ec4899,color:#f8fafc
    style ALGORAND fill:#0a2018,stroke:#34d399,color:#f8fafc
```

| Layer | Role |
|-------|------|
| **Experience** | Web builder, chat, voice, and Telegram as entry points |
| **Orchestration** | Ordered steps with logic, math, conditions, and multi-agent flows |
| **Safety** | Pre-sign previews, advisor context, Guardian caps, LogicSig delegation rules |
| **Execution** | Wallet-signed transactions and atomic groups on Algorand |
| **Persistence** | Supabase stores workflows and run history across sessions |
| **Cloud agent** | Background triggers when you opt in (Node.js server on Railway or local) |

### Repository structure

Monorepo managed with [AlgoKit](https://github.com/algorandfoundation/algokit-cli) workspace configuration (`.algokit.toml`):

| Package | Path | Role |
|---------|------|------|
| **Frontend** | `projects/Zuik-frontend` | React web app: builder, dashboard, wallet, swap execution |
| **Backend** | `projects/server` | AI proxy, market proxy, cloud agent, Telegram, voice |
| **Contracts** | `projects/Zuik-contracts` | Guardian and LogicSig delegation smart contracts (Algorand TypeScript / Puya) |

---

## Workflow creation

From natural language to on-chain execution, Zuik materializes intent into a reviewable flow before anything is signed.

```mermaid
flowchart TD
    START(["User describes goal"]) --> PARSE["Intent engine parses goal"]
    PARSE --> MATERIALIZE["Blocks placed on canvas"]
    MATERIALIZE --> REFINE{"Need changes?"}
    REFINE -->|"Chat or voice"| PARSE
    REFINE -->|"Drag and drop"| MATERIALIZE
    REFINE -->|"Looks good"| PREVIEW["Safety preview: fees, slippage, limits"]
    PREVIEW --> POLICY{"Guardian or LogicSig enabled?"}
    POLICY -->|"Yes"| VERIFY["On-chain policy check"]
    POLICY -->|"No"| SIGN
    VERIFY --> SIGN["Wallet signs atomic group"]
    SIGN --> RUN["Workflow runs on trigger or schedule"]
    RUN --> HISTORY["Results stored in dashboard"]

    style START fill:#1a1040,stroke:#a78bfa,color:#f8fafc
    style PREVIEW fill:#0a1a2a,stroke:#00e5ff,color:#f8fafc
    style SIGN fill:#0a2018,stroke:#34d399,color:#f8fafc
    style RUN fill:#2a1020,stroke:#ec4899,color:#f8fafc
```

Refine through chat, voice, or drag-and-drop until the canvas matches your intent. The safety preview surfaces fees and slippage before you sign.

---

## Smart contracts

Contracts are written in **Algorand TypeScript**, compiled with **Puya**, and deployed through **AlgoKit**. Generated TypeScript clients link into the frontend via `algokit project link`.

### Contract interaction flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Wallet
    participant Guardian as ZuikGuardian
    participant Verifier as DelegationVerifier
    participant DEX as Tinyman / Folks Router

    User->>Frontend: Enable automation with limits
    Frontend->>Wallet: Request signature
    Wallet->>Guardian: Register agent and daily cap
    Note over User,Verifier: LogicSig path (optional)
    User->>Frontend: Configure delegation policy
    Frontend->>Verifier: Deploy per-user verifier app
    Frontend->>Wallet: Sign LogicSig template

    User->>Frontend: Run workflow
    Frontend->>Wallet: Sign atomic transaction group
    Wallet->>Guardian: attemptSpend (if delegated)
    Guardian-->>Wallet: Approve or revert
    Wallet->>DEX: Swap transactions
    Wallet->>Verifier: Policy validation call
    Verifier-->>Wallet: Approve or revert
    DEX-->>Frontend: Execution result
```

### ZuikGuardian

On-chain **daily spending limits** for delegated or automated agents. The contract owner registers agents with a daily cap in microAlgos. Only the registered agent may call `attemptSpend`; the contract reverts if the cap is exceeded or the contract is paused.

| Method | Caller | Purpose |
|--------|--------|---------|
| `createApplication` | Deployer | Sets contract owner |
| `optIn` | Agent | Creates local state before registration |
| `registerAgent(address,uint64)` | Owner | Sets daily cap for an opted-in agent |
| `updateDailyCap(address,uint64)` | Owner | Updates an agent cap |
| `attemptSpend(address,uint64)` | Agent | Records spend against daily limit |
| `setPaused(bool)` | Owner | Emergency pause |

Source: `projects/Zuik-contracts/smart_contracts/guardian/contract.algo.ts`

### Delegation verifier and LogicSig

**LogicSig delegation** for server-side automation with strict on-chain guardrails. The user deploys a verifier application with trade size, daily cap, allowed assets, allowed DEX application ID, and expiry round. A templated LogicSig may only submit payments, asset transfers, or application calls that match those rules and include a paired verifier call in the same atomic group.

| Component | Purpose |
|-----------|---------|
| `ZuikDelegationVerifier` | Validates each spend against owner policy |
| `ZuikDelegationLsig` | Template LogicSig bound to verifier and DEX allowlist |

Source: `projects/Zuik-contracts/smart_contracts/lsig_delegation/contract.algo.ts`

Verifier applications deploy **per user** from the Settings screen when enabling LogicSig automation. Policy is stored in Supabase for the cloud agent.

### TestNet deployment

| Contract | Network | Application ID | Application address | Status |
|----------|---------|----------------|---------------------|--------|
| **ZuikGuardian** | TestNet | `762678299` | `Y3L2MA2ZFE7TV2RP6SUH5ULCKVM5K7NSDBRCC6SSPXLCHL3GKWXPL5VR2Y` | Deployed (2026-05-17) |
| **ZuikDelegationVerifier** | TestNet | Per-user deploy | Per-user | Deployed via Settings |
| **ZuikDelegationLsig** | TestNet | Per-user template | Per-user | Created with verifier |

Deployment artifact: `projects/Zuik-contracts/smart_contracts/artifacts/guardian/deployment.json`

**Configure the frontend** after Guardian deploy:

```bash
VITE_GUARDIAN_APP_ID=762678299
VITE_GUARDIAN_APP_ADDRESS=Y3L2MA2ZFE7TV2RP6SUH5ULCKVM5K7NSDBRCC6SSPXLCHL3GKWXPL5VR2Y
```

**Redeploy contracts** (LocalNet or TestNet):

```bash
cd projects/Zuik-contracts
algokit localnet start          # LocalNet only
npm run build                   # Compile TEAL and generate clients
algokit project deploy testnet  # or localnet
```

Integration tests: `npm run test:localnet` and `npm run test:testnet` in `projects/Zuik-contracts`.

---

## Technology and integrations

| Area | Technologies |
|------|--------------|
| **Frontend** | React 18, TypeScript, Vite, React Router, `@xyflow/react`, `@txnlab/use-wallet` |
| **Backend** | Node.js 20+, Express-style routing, cloud workflow runner |
| **Smart contracts** | Algorand TypeScript (Puya), AlgoKit CLI, AlgoKit Utils, generated ARC-56 clients |
| **Blockchain** | `algosdk`, Algorand atomic transaction groups, LogicSig templates |
| **AI** | Groq (intent parsing and chat via server proxy) |
| **Database** | Supabase (workflows, execution history, delegation vault records) |
| **Voice** | Groq Whisper transcription, ElevenLabs text-to-speech (optional) |
| **Demos** | Playwright browser automation |

| Integration | Role in Zuik |
|-------------|--------------|
| **[Tinyman](https://tinyman.org/)** | Primary TestNet swap execution via `@tinymanorg/tinyman-js-sdk` |
| **[Folks Router](https://folksrouter.io/)** | Aggregated swap quotes and routes |
| **[Pera Wallet](https://perawallet.app/)** | Wallet connect via `@perawallet/connect` |
| **[Defly Wallet](https://defly.app/)** | Wallet connect via `@blockshake/defly-connect` |
| **[AlgoKit](https://github.com/algorandfoundation/algokit-cli)** | Workspace build, LocalNet, contract deploy, client generation |
| **[Nodely](https://nodely.io/)** | Free-tier TestNet algod and indexer endpoints (default in `.env.template`) |
| **[Supabase](https://supabase.com/)** | Workflow persistence, dashboard, delegation metadata |
| **[Groq](https://groq.com/)** | Server-side LLM for intent parsing (key never exposed to browser) |
| **[Telegram](https://telegram.org/)** | Bot notifications, workflow control, voice conversations via `@ZuikDeFiBot` |

Swap routing tries **Tinyman** first (on-chain pool state), then **Folks Router** when a competitive quote is available (`projects/Zuik-frontend/src/services/swapToken.ts`).

---

## Getting started

| Step | Action |
|------|--------|
| **1** | Open the Zuik application and connect a supported Algorand wallet (Pera, Defly, Exodus, and others on TestNet). |
| **2** | Open the builder. Use chat, voice, or a starter template. |
| **3** | Try a prompt like: *Every Friday, swap $X USDC to ALGO and message me on Telegram when done.* |
| **4** | Review the visual workflow, limits, and fee preview. |
| **5** | Sign once to activate. Your keys never leave your wallet. |
| **6** (optional) | Enable the cloud agent for 24/7 schedules and price watches. |

Fund TestNet wallets from the [Algorand TestNet dispenser](https://dispenser.testnet.aws.algodev.network/).

**Security habits:** start with small amounts, use Guardian caps for delegated automation, keep Telegram and API keys private.

For local development, continue to [Developer setup](#developer-setup).

---

## Developer setup

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js 20+** | Frontend and server |
| **Node.js 22+** | Smart contracts |
| **npm 9+** | Bundled with Node.js |
| **Docker** | LocalNet only |
| **AlgoKit CLI 2.5+** | Contract compile, deploy, LocalNet |

Optional keys for full functionality: [Groq](https://console.groq.com), [Supabase](https://supabase.com).

### Clone and install

```bash
git clone https://github.com/DarshanKrishna-DK/Zuik.git
cd Zuik

cd projects/Zuik-frontend && npm install
cd ../server && npm install
cd ../Zuik-contracts && npm install
```

Build everything from the repository root:

```bash
algokit project run build
```

### Environment configuration

Never commit secrets. Use `.env.local` (frontend) and `.env` (server).

**Frontend** (`projects/Zuik-frontend`):

```bash
cd projects/Zuik-frontend
cp .env.template .env.local
```

Uncomment **one** network block (TestNet, LocalNet, or MainNet). TestNet works out of the box with Nodely endpoints.

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `VITE_ALGOD_SERVER`, `VITE_ALGOD_NETWORK` | Yes | Algorand node |
| `VITE_INDEXER_SERVER` | Yes | Transaction history |
| `VITE_SERVER_URL` | Optional in dev | Backend URL for production builds (dev uses Vite proxy) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | For persistence | Workflows and dashboard |
| `VITE_GUARDIAN_APP_ID`, `VITE_GUARDIAN_APP_ADDRESS` | For Guardian | TestNet values in [Smart contracts](#smart-contracts) or your deploy |

The Groq key lives on the **server** as `GROQ_API_KEY`, not in the frontend.

**Backend** (`projects/server`):

```bash
cd projects/server
cp .env.example .env
```

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Yes | Database |
| `GROQ_API_KEY` | For AI | Intent parsing |
| `CORS_ORIGIN` | Yes | Include `http://localhost:5173` (and `5174` if Vite falls back) |

See [projects/server/README.md](projects/server/README.md) for Railway deployment and Telegram webhook setup.

### Running the project

| Service | Port | URL |
|---------|------|-----|
| Frontend (Vite) | 5173 | http://localhost:5173 |
| Backend | 4021 | http://localhost:4021 |
| Voice server (development) | 3002 | http://localhost:3002 |

**Terminal 1 - Backend**

```bash
cd projects/server
# Set PORT=4021 in .env (or export PORT=4021)
npm run dev
```

**Terminal 2 - Frontend**

```bash
cd projects/Zuik-frontend
npm run dev
```

**Verify**

1. `curl http://localhost:4021/health` returns `"status": "ok"`.
2. Open http://localhost:5173 and connect a TestNet wallet (Pera, Defly, or Exodus).
3. Send a chat prompt in the builder (requires `GROQ_API_KEY` on the server).

---

## Development workflow

| Location | Command | Purpose |
|----------|---------|---------|
| `projects/Zuik-frontend` | `npm run dev` | Development server |
| `projects/Zuik-frontend` | `npm run build:strict` | Typecheck and production build |
| `projects/server` | `npm run dev` | Backend with hot reload |
| `projects/server` | `npm run agent:dev` | Cloud agent loop only |
| `projects/Zuik-contracts` | `npm run build` | Compile contracts |
| `projects/Zuik-contracts` | `npm run test:localnet` | Contract integration tests |
| Repository root | `algokit project run build` | Build frontend and contracts |

---

## Security and trust

| Principle | Commitment |
|-----------|------------|
| **Non-custodial** | Zuik cannot move funds without your wallet signature |
| **Transparent workflows** | Every step visible before approval |
| **On-chain limits** | Guardian and LogicSig verifier cap automated spending |
| **Atomic safety** | Multi-step actions avoid partial execution |
| **You own your keys** | Export, rotate, and disconnect wallets at any time |

Zuik provides tooling, not investment advice. Only automate amounts you can afford to risk.

---

## License

Zuik is open source under the [MIT License](LICENSE).

---

<p align="center">
  <strong>DeFi automation on Algorand - describe it, review it, sign it, forget the busywork.</strong>
</p>
