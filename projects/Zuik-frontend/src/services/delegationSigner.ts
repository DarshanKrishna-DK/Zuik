import algosdk from 'algosdk'
import { type Wallet, WalletId } from '@txnlab/use-wallet'

/**
 * NEW DELEGATION SIGNER - Based on Research Findings
 * 
 * Key insights from working LogicSig examples:
 * - For delegation mode, wallet needs to sign the program bytes  
 * - The signed data creates authority for LogicSig to sign transactions on behalf of the account
 * - Use algosdk-compatible signing patterns
 */

export interface SignDelegationParams {
  programBytes: Uint8Array
  message: string
  signerAddress: string
  activeWallet: Wallet | null | undefined
  signData?: (data: string, metadata?: { encoding?: string }) => Promise<{ signature: Uint8Array }>
  withPrivateKey?: <T>(callback: (secretKey: Uint8Array) => Promise<T>) => Promise<T>
}

const PROGRAM_TAG = new TextEncoder().encode('Program')

function buildDelegationBytes(programBytes: Uint8Array): Uint8Array {
  const bytesToSign = new Uint8Array(PROGRAM_TAG.length + programBytes.length)
  bytesToSign.set(PROGRAM_TAG)
  bytesToSign.set(programBytes, PROGRAM_TAG.length)
  return bytesToSign
}

export async function signDelegationProgram(params: SignDelegationParams): Promise<Uint8Array> {
  const { programBytes, message, signerAddress, activeWallet, signData, withPrivateKey } = params

  if (!activeWallet) {
    throw new Error('Connect your wallet to enable automation permissions.')
  }

  console.log('[NEW DELEGATION SIGNER] Starting delegation program signing')
  console.log('[NEW DELEGATION SIGNER] - Program bytes length:', programBytes.length)
  console.log('[NEW DELEGATION SIGNER] - Signer address:', signerAddress)
  console.log('[NEW DELEGATION SIGNER] - Wallet type:', activeWallet.id)

  const bytesToSign = buildDelegationBytes(programBytes)
  console.log('[NEW DELEGATION SIGNER] - Delegation bytes length:', bytesToSign.length)

  // For wallets with private key access, use algosdk's delegation signing
  if (withPrivateKey && (activeWallet.id === WalletId.MNEMONIC || activeWallet.id === WalletId.KMD)) {
    console.log('[NEW DELEGATION SIGNER] Using private key wallet delegation')
    
    return withPrivateKey(async (secretKey) => {
      // Create temporary LogicSigAccount and use algosdk's sign method
      const tempLsigAccount = new algosdk.LogicSigAccount(programBytes)
      tempLsigAccount.sign(secretKey)
      
      if (!tempLsigAccount.lsig.sig) {
        throw new Error('Failed to create delegation signature with private key')
      }
      
      console.log('[NEW DELEGATION SIGNER] ✅ Private key delegation signing successful')
      return tempLsigAccount.lsig.sig
    })
  }

  // For external wallets (like Pera), we need them to sign the program bytes
  // Research showed this creates the delegation authority
  if (activeWallet.id === WalletId.PERA) {
    console.log('[NEW DELEGATION SIGNER] Using Pera Wallet delegation signing')
    
    const { PeraWalletConnect } = await import('@perawallet/connect')
    const pera = new PeraWalletConnect()
    const accounts = await pera.reconnectSession()
    
    if (!accounts.includes(signerAddress)) {
      throw new Error('Active Pera account does not match the connected wallet address.')
    }
    
    // Ask Pera to sign the program bytes for delegation
    const signatures = await pera.signData([{ data: bytesToSign, message }], signerAddress, true)
    
    if (!signatures[0]?.length) {
      throw new Error('Pera Wallet did not return a delegation signature.')
    }
    
    console.log('[NEW DELEGATION SIGNER] ✅ Pera Wallet delegation signing successful')
    return signatures[0]
  }

  // For other wallets that support signData
  if (activeWallet.canSignData && signData) {
    console.log('[NEW DELEGATION SIGNER] Using wallet signData method')
    
    const response = await signData(Buffer.from(bytesToSign).toString('base64'), {
      encoding: 'base64',
    })
    
    console.log('[NEW DELEGATION SIGNER] ✅ SignData delegation signing successful')
    return response.signature
  }

  throw new Error(getWalletUnsupportedMessage(activeWallet))
}

export function walletSupportsDelegationSigning(wallet: Wallet | null | undefined): boolean {
  if (!wallet) return false
  
  // Wallets that support delegation signing
  return (
    wallet.id === WalletId.PERA ||
    wallet.id === WalletId.MNEMONIC ||
    wallet.id === WalletId.KMD ||
    wallet.canSignData
  )
}

export function delegationWalletHint(wallet: Wallet | null | undefined): string {
  if (!wallet) {
    return 'Please connect a wallet to create automation permissions.'
  }
  
  if (walletSupportsDelegationSigning(wallet)) {
    return `${wallet.metadata.name} supports automation permissions. You can create delegation signatures to enable autonomous transactions.`
  }
  
  return `${wallet.metadata.name} does not support automation permissions. Please use Pera Wallet or another compatible wallet to enable autonomous transactions.`
}

function getWalletUnsupportedMessage(activeWallet: Wallet): string {
  return `Wallet "${activeWallet.metadata.name}" does not support LogicSig delegation signing. Please use a wallet that supports either private key access or data signing.`
}