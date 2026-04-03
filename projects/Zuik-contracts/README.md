# Zuik Contracts

Algorand smart contracts for the Zuik platform, written in [Algorand Python](https://github.com/algorandfoundation/puya) and compiled to TEAL bytecode using the Puya compiler.

---

## Setup

### Requirements

- **Python** 3.12 or later ([python.org](https://www.python.org/downloads/))
- **Poetry** 1.2 or later ([python-poetry.org](https://python-poetry.org/docs/#installation))
- **AlgoKit CLI** 2.0 or later ([install guide](https://github.com/algorandfoundation/algokit-cli#install))
- **Docker** (only needed for LocalNet) ([docker.com](https://www.docker.com/))

### Install Dependencies

```bash
algokit project bootstrap all
```

This installs all Python dependencies and sets up a virtual environment in `.venv/`.

---

## Creating a Smart Contract

To add a new contract to the project:

```bash
algokit generate smart-contract
```

This creates a new folder under `smart_contracts/` with:
- `contract.py` — your contract logic
- `deploy_config.py` — deployment configuration

---

## Build

Compile all smart contracts:

```bash
algokit project run build
```

Build a specific contract only:

```bash
algokit project run build -- your_contract_name
```

Compiled output (TEAL files, ARC-56 app specs, and typed clients) goes to `smart_contracts/artifacts/`.

---

## Deploy

### To LocalNet

1. Make sure Docker is running
2. Start LocalNet: `algokit localnet start`
3. Deploy:

```bash
algokit project deploy localnet
```

### To TestNet

1. Create a `.env.testnet` file (this file is git-ignored):

```
ALGOD_TOKEN=
ALGOD_SERVER=https://testnet-api.4160.nodely.dev
ALGOD_PORT=443
INDEXER_TOKEN=
INDEXER_SERVER=https://testnet-idx.4160.nodely.dev
INDEXER_PORT=443
DEPLOYER_MNEMONIC=your twenty five word mnemonic here
```

2. Deploy:

```bash
algokit project deploy testnet
```

> Your deployer account needs TestNet ALGO. Get free TestNet ALGO from the [Algorand Dispenser](https://dispenser.testnet.aws.algodev.network/).

---

## Project Structure

```
smart_contracts/
├── __main__.py            Build and deploy entrypoint
├── __init__.py
├── your_contract/         One folder per contract
│   ├── contract.py        Contract logic (Algorand Python)
│   └── deploy_config.py   Deployment configuration
└── artifacts/             Compiled output (auto-generated)
    └── your_contract/
        ├── *.approval.teal
        ├── *.clear.teal
        ├── *.arc56.json
        └── *_client.py
```

---

## Debugging

This project supports the [AlgoKit AVM Debugger](https://marketplace.visualstudio.com/items?itemName=algorandfoundation.algokit-avm-vscode-debugger) VS Code extension. Trace files are generated during deployment and can be inspected interactively.

---

## Tools Used

| Tool | Purpose |
|:-----|:--------|
| [Algorand Python](https://github.com/algorandfoundation/puya) | Smart contract language |
| [AlgoKit CLI](https://github.com/algorandfoundation/algokit-cli) | Build, deploy, and manage contracts |
| [AlgoKit Utils (Python)](https://github.com/algorandfoundation/algokit-utils-py) | Deployment and interaction utilities |
| [Poetry](https://python-poetry.org) | Python dependency management |
