import { AlgoViteClientConfig, AlgoViteKMDConfig } from '../../interfaces/network'

export function getAlgodConfigFromViteEnvironment(): AlgoViteClientConfig {
  // Temporarily hardcode working TestNet endpoint to fix LogicSig execution
  console.log('[ALGOD CONFIG] Using hardcoded TestNet endpoint for debugging')
  return {
    server: 'https://testnet-api.algonode.cloud',
    port: '',
    token: '',
    network: 'testnet',
  }
}

export function getIndexerConfigFromViteEnvironment(): AlgoViteClientConfig {
  // Temporarily hardcode working TestNet endpoint to fix LogicSig execution
  console.log('[INDEXER CONFIG] Using hardcoded TestNet endpoint for debugging')
  return {
    server: 'https://testnet-idx.algonode.cloud',
    port: '',
    token: '',
    network: 'testnet',
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
