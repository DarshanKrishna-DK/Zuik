import { AlgoViteClientConfig, AlgoViteKMDConfig } from '../../interfaces/network'

const ALGOD_FALLBACK_SERVER = 'https://testnet-api.algonode.cloud'
const INDEXER_FALLBACK_SERVER = 'https://testnet-idx.algonode.cloud'

export function getAlgodConfigFromViteEnvironment(): AlgoViteClientConfig {
  return {
    server: import.meta.env.VITE_ALGOD_SERVER || ALGOD_FALLBACK_SERVER,
    port: import.meta.env.VITE_ALGOD_PORT || '',
    token: import.meta.env.VITE_ALGOD_TOKEN || '',
    network: import.meta.env.VITE_ALGOD_NETWORK || 'testnet',
  }
}

export function getIndexerConfigFromViteEnvironment(): AlgoViteClientConfig {
  return {
    server: import.meta.env.VITE_INDEXER_SERVER || INDEXER_FALLBACK_SERVER,
    port: import.meta.env.VITE_INDEXER_PORT || '',
    token: import.meta.env.VITE_INDEXER_TOKEN || '',
    network: import.meta.env.VITE_ALGOD_NETWORK || 'testnet',
  }
}

export function getKmdConfigFromViteEnvironment(): AlgoViteKMDConfig {
  if (!import.meta.env.VITE_KMD_SERVER) {
    throw new Error('Attempt to get default kmd configuration without specifying VITE_KMD_SERVER in the environment variables')
  }

  return {
    server: import.meta.env.VITE_KMD_SERVER,
    port: import.meta.env.VITE_KMD_PORT,
    token: import.meta.env.VITE_KMD_TOKEN,
    wallet: import.meta.env.VITE_KMD_WALLET,
    password: import.meta.env.VITE_KMD_PASSWORD,
  }
}
