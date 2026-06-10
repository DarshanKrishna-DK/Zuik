import { SupportedWallet, WalletId, WalletManager, WalletProvider } from '@txnlab/use-wallet-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'
import { BrowserRouter } from 'react-router-dom'
import { getAlgodConfigFromViteEnvironment, getKmdConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'
import AppShell from './AppShell'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const BROWSER_WALLETS: SupportedWallet[] = [
  { id: WalletId.PERA },
  { id: WalletId.DEFLY },
  { id: WalletId.EXODUS },
]

const DEMO_MNEMONIC_WALLET: SupportedWallet = {
  id: WalletId.MNEMONIC,
  options: {
    persistToStorage: false,
    promptForMnemonic: async () => {
      const phrase = import.meta.env.VITE_DEMO_WALLET_MNEMONIC?.trim()
      return phrase || null
    },
  },
}

let supportedWallets: SupportedWallet[]
if (import.meta.env.VITE_ALGOD_NETWORK === 'localnet') {
  const kmdConfig = getKmdConfigFromViteEnvironment()
  supportedWallets = [
    {
      id: WalletId.KMD,
      options: {
        baseServer: kmdConfig.server,
        token: String(kmdConfig.token),
        port: String(kmdConfig.port),
      },
    },
  ]
} else {
  supportedWallets = [...BROWSER_WALLETS]
  if (import.meta.env.VITE_DEMO_AUTO_WALLET === 'true') {
    supportedWallets.push(DEMO_MNEMONIC_WALLET)
  }
}

export default function App() {
  const algodConfig = getAlgodConfigFromViteEnvironment()

  const walletManager = new WalletManager({
    wallets: supportedWallets,
    defaultNetwork: algodConfig.network,
    networks: {
      [algodConfig.network]: {
        algod: {
          baseServer: algodConfig.server,
          port: algodConfig.port,
          token: String(algodConfig.token),
        },
      },
    },
    options: {
      resetNetwork: true,
      debug: false,
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <WalletProvider manager={walletManager}>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </WalletProvider>
      </SnackbarProvider>
    </QueryClientProvider>
  )
}
