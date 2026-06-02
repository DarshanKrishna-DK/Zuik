export function explorerBase(network: string): string {
  if (network === 'mainnet') return 'https://lora.algokit.io/mainnet'
  if (network === 'localnet') return 'https://lora.algokit.io/localnet'
  return 'https://lora.algokit.io/testnet'
}

export function accountExplorerUrl(network: string, address: string): string {
  return `${explorerBase(network)}/account/${address}`
}
