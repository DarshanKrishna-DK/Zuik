# Zuik Frontend

The React web application for Zuik. This is the visual interface where users build, configure, and execute DeFi workflows on Algorand.

---

## What This Project Contains

| Folder | Description |
|:-------|:------------|
| `src/pages/` | Landing page, Builder (main workflow editor), Dashboard, Settings |
| `src/components/flow/` | Visual flow components: nodes, sidebar, execution log, chat panel |
| `src/components/layout/` | Navigation bar and wallet connection |
| `src/lib/` | Block registry (30 blocks), flow execution engine, intent materializer |
| `src/services/` | Algorand transaction services, Saber Money API, AI intent parser |
| `src/utils/` | Network configuration helpers |

---

## Setup

### Requirements

- **Node.js** 20 or later ([nodejs.org](https://nodejs.org))
- **npm** 9 or later (comes with Node.js)

### Install Dependencies

```bash
npm install
```

### Configure Environment

Copy the template and fill in your API keys:

```bash
cp .env.template .env
```

Open `.env` and set these values:

| Variable | Required | Where to Get It |
|:---------|:---------|:----------------|
| `VITE_GROQ_API_KEY` | Yes (for AI assistant) | Free at [console.groq.com/keys](https://console.groq.com/keys) |
| `VITE_SABER_CLIENT_ID` | Optional | From Saber Money representative |
| Saber signing | Optional | Deploy `supabase/functions/saber-sign` and set `SABER_CLIENT_ID` + `SABER_CLIENT_SECRET` as Edge Function secrets (never put the secret in Vite env) |

The Algorand TestNet node URLs are pre-filled and work out of the box.

### Run the Development Server

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

### Build for Production

```bash
npm run build
```

The output goes to the `dist/` folder.

---

## Switching Between Networks

The `.env` file has three sections: TestNet, LocalNet, and MainNet. Only one should be uncommented at a time.

**To use LocalNet:**
1. Make sure Docker is running
2. Start the local network: `algokit localnet start`
3. Comment out the TestNet section in `.env`
4. Uncomment the LocalNet section
5. Restart the dev server

**To use TestNet (default):**
- The TestNet section is active by default using [Nodely](https://nodely.io) free tier nodes
- No signup or API key is needed for the Algorand node

---

## Wallet Setup

On TestNet, the following wallets are supported:

- [Pera Wallet](https://perawallet.app)
- [Defly Wallet](https://defly.app)
- [Exodus Wallet](https://www.exodus.com)

On LocalNet, the KMD (Key Management Daemon) wallet is used automatically.

> For TestNet, you need test ALGO. Get free TestNet ALGO from the [Algorand Dispenser](https://dispenser.testnet.aws.algodev.network/).

---

## Available Scripts

| Command | What It Does |
|:--------|:-------------|
| `npm run dev` | Starts the development server on port 5173 |
| `npm run build` | Compiles TypeScript and builds for production |
| `npm run preview` | Previews the production build locally |

---

## Key Technologies

| Technology | Purpose |
|:-----------|:--------|
| [React](https://react.dev) 18 | UI framework |
| [Vite](https://vitejs.dev) 5 | Build tool and dev server |
| [TypeScript](https://www.typescriptlang.org) | Type safety |
| [@xyflow/react](https://reactflow.dev) | Visual flow editor (drag and drop canvas) |
| [@txnlab/use-wallet](https://github.com/TxnLab/use-wallet) | Algorand wallet integration |
| [AlgoKit Utils](https://github.com/algorandfoundation/algokit-utils-ts) | Algorand SDK utilities |
| [Lucide React](https://lucide.dev) | Icon library |
| [notistack](https://notistack.com) | Toast notifications |
