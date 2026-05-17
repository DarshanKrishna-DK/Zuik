import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import algosdk from 'algosdk'

const DEFAULT_MAX_PER_TRADE = BigInt(1_000_000)
const DEFAULT_DAILY_CAP = BigInt(5_000_000)
const DEFAULT_ALLOWED_FROM_ASSET = BigInt(0)
const DEFAULT_ALLOWED_TO_ASSET = BigInt(0)
const DEFAULT_ALLOWED_DEX_APP_ID = BigInt(0)

function readBigIntEnv(name: string, fallback: bigint): bigint {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? BigInt(parsed) : fallback
}

export async function deploy() {
  console.log('=== Deploying ZuikDelegationVerifier ===')

  // Uses AlgoKit environment (localnet, testnet, mainnet) from .env / process env
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')
  console.log('Deployer address:', deployer.addr)
  
  const { algod } = algorand.client

  // Check deployer account balance
  const accountInfo = await algod.accountInformation(deployer.addr).do()
  console.log('Deployer balance:', accountInfo.amount, 'microAlgos')
  
  if (accountInfo.amount < 1000000) { // 1 ALGO
    throw new Error('Deployer account needs at least 1 ALGO for deployment')
  }

  const status = await algod.status().do()
  console.log('Status response:', JSON.stringify(status, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2))
  
  const currentRound = BigInt(status['last-round'] ?? status.lastRound ?? 0)
  const expiryRounds = BigInt(Number(process.env.EXPIRY_ROUNDS ?? 172_800)) // about 30 days
  
  console.log('Current round:', currentRound)
  console.log('Expiry rounds offset:', expiryRounds)
  
  // Use a much larger future round to avoid expiry issues during deployment
  const finalExpiryRound = currentRound + BigInt(10_000_000) // Very far future
  console.log('Final expiry round:', finalExpiryRound)

  // Read the compiled TEAL programs
  const fs = require('fs')
  const path = require('path')
  
  const approvalTealPath = path.join(__dirname, '../artifacts/lsig_delegation/ZuikDelegationVerifier.approval.teal')
  const clearTealPath = path.join(__dirname, '../artifacts/lsig_delegation/ZuikDelegationVerifier.clear.teal')
  
  const approvalTeal = fs.readFileSync(approvalTealPath, 'utf8')
  const clearTeal = fs.readFileSync(clearTealPath, 'utf8')
  
  const approvalProgram = await algod.compile(approvalTeal).do()
  const clearProgram = await algod.compile(clearTeal).do()

  const suggestedParams = await algod.getTransactionParams().do()
  
  // Prepare ABI method call arguments
  const createMethod = algosdk.ABIMethod.fromSignature(
    'createApplication(uint64,uint64,uint64,uint64,uint64,uint64)void'
  )
  
  const UINT64 = algosdk.ABIType.from('uint64')
  const appArgs = [
    createMethod.getSelector(),
    UINT64.encode(readBigIntEnv('MAX_PER_TRADE', DEFAULT_MAX_PER_TRADE)),
    UINT64.encode(readBigIntEnv('DAILY_CAP', DEFAULT_DAILY_CAP)),
    UINT64.encode(readBigIntEnv('ALLOWED_FROM_ASSET', DEFAULT_ALLOWED_FROM_ASSET)),
    UINT64.encode(readBigIntEnv('ALLOWED_TO_ASSET', DEFAULT_ALLOWED_TO_ASSET)),
    UINT64.encode(readBigIntEnv('ALLOWED_DEX_APP_ID', DEFAULT_ALLOWED_DEX_APP_ID)),
    UINT64.encode(finalExpiryRound),
  ]
  
  const createTxn = algosdk.makeApplicationCreateTxnFromObject({
    sender: deployer.addr,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    approvalProgram: new Uint8Array(Buffer.from(approvalProgram.result, 'base64')),
    clearProgram: new Uint8Array(Buffer.from(clearProgram.result, 'base64')),
    numGlobalInts: 8,
    numGlobalByteSlices: 1,
    numLocalInts: 0,
    numLocalByteSlices: 0,
    appArgs,
    suggestedParams,
  })

  const signedCreate = await deployer.signer([createTxn], [0])
  const createSend = await algod.sendRawTransaction(signedCreate).do()
  const createTxId = (createSend as { txid?: string; txId?: string }).txid ?? (createSend as { txId: string }).txId
  const confirmed = await algosdk.waitForConfirmation(algod, createTxId, 10)
  const appId = Number(confirmed.applicationIndex ?? (confirmed as { 'application-index'?: number })['application-index'] ?? 0)

  if (!appId) {
    throw new Error('Failed to deploy contract - no app ID returned')
  }

  console.log('Deployed app ID:', appId)

  // Fund the app account
  const appAddress = algosdk.getApplicationAddress(appId)
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: deployer.addr,
    receiver: appAddress,
    amount: BigInt(250_000),
    suggestedParams,
  })
  
  const signedFund = await deployer.signer([fundTxn], [0])
  const fundSend = await algod.sendRawTransaction(signedFund).do()
  const fundTxId = (fundSend as { txid?: string; txId?: string }).txid ?? (fundSend as { txId: string }).txId

  console.log('App funded, transaction ID:', fundTxId)
  console.log('App address:', appAddress)
}
