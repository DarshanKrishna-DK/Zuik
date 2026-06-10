# Zuik-contracts

Algorand smart contracts for Zuik. The active contract is **ZuikGuardian**, an on-chain policy store for agent sub-accounts.

## Prerequisites

- Node.js 22+
- AlgoKit CLI 2.6+
- Docker (for LocalNet)
- Puya compiler 4.4.4+

## Setup

```bash
npm install
algokit generate env-file -a target_network localnet
algokit localnet start
```

## Build and deploy

```bash
npm run build
algokit project deploy localnet
```

Deploy a single contract:

```bash
algokit project deploy localnet -- guardian
```

For TestNet or MainNet, set `DEPLOYER_MNEMONIC` and run `algokit project deploy testnet`.

## Integration tests

LocalNet must be running first.

```bash
npm run test:localnet
```

TestNet smoke test (needs `ALGOKIT_DISPENSER_ACCESS_TOKEN` or `DISPENSER_MNEMONIC`):

```bash
npm run test:testnet
```

For production bytecode, use `npm run build` and `algokit project deploy` rather than the TestNet smoke script alone.

## Project layout

| Path | Purpose |
|------|---------|
| `smart_contracts/guardian/contract.algo.ts` | ZuikGuardian source |
| `smart_contracts/guardian/deploy-config.ts` | Deploy script |
| `smart_contracts/artifacts/guardian/` | Compiled TEAL, ARC specs, generated client |
| `scripts/test-localnet.ts` | LocalNet integration test |
| `scripts/test-testnet.ts` | TestNet connectivity smoke test |

The frontend copies the generated client to `projects/Zuik-frontend/src/contracts/ZuikGuardian.ts` after deploy.

## ZuikGuardian overview

Owner registers agent policies with per-trade and daily caps, allowed assets, and expiry. Payouts go through an atomic group:

1. Payment or ASA transfer from the agent account
2. `authorize_trade` or `authorize_asset_trade` on Guardian

If policy checks fail, the whole group reverts.
