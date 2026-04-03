# Typed App Clients

This folder holds auto-generated TypeScript clients for Algorand smart contracts.

## How to Generate Clients

From the repository root:

```bash
algokit project link --all
```

This scans the `Zuik-contracts` project for compiled ARC-56 app specs and generates typed TypeScript clients here.

## How to Use

Import the generated client into any React component or service file:

```typescript
import { YourContractClient } from '../contracts/YourContractClient'
```

The client provides typed methods that match the smart contract ABI, making it easy to call contract methods with full type safety.
