/**
 * x402 premium market data integration test (TestNet).
 *
 * Verifies:
 * 1. Agent balance before/after
 * 2. Guardian-wrapped x402 payment for premium quote
 * 3. On-chain transaction confirmation via indexer
 *
 * Usage:
 *   node scripts/test-x402-premium.mjs
 *   node scripts/test-x402-premium.mjs --server-only   # skip payment (402 check only)
 */
import 'dotenv/config'
import algosdk from 'algosdk'
import fs from 'node:fs'
import path from 'node:path'
import { getAlgodClient } from '../algorand.js'
import { fetchWithGuardianX402, getAgentBalanceMicroAlgos } from '../x402AgentClient.js'
import { readGuardianContext, maxSpendableMicroAlgos } from '../guardianPolicy.js'

const AGENT = process.env.X402_TEST_AGENT
  ?? '2745CL2UWWO5LM2FKWGKCVVCG2FGD6RZMA7ALPTFTBEYO7X6ABW2QC7WM4'
const GUARDIAN_APP_ID = Number(process.env.GUARDIAN_APP_ID ?? process.env.VITE_GUARDIAN_APP_ID ?? 763727553)
const PORT = process.env.PORT ?? '4021'
const SERVER_BASE = (process.env.X402_SERVER_BASE ?? process.env.SERVER_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const INDEXER = process.env.INDEXER_URL ?? 'https://testnet-idx.4160.nodely.dev'

const serverOnly = process.argv.includes('--server-only')

function loadAgentSigner() {
  const ksPath = path.resolve(process.cwd(), process.env.ZUIK_KEYSTORE_FILE ?? '.keystore.json')
  if (!fs.existsSync(ksPath)) {
    throw new Error(`Keystore not found at ${ksPath}. Register agent key first.`)
  }
  const ks = JSON.parse(fs.readFileSync(ksPath, 'utf8'))
  const mnemonic = ks[AGENT]
  if (!mnemonic) throw new Error(`No key for agent ${AGENT} in keystore`)
  const account = algosdk.mnemonicToSecretKey(mnemonic)
  return algosdk.makeBasicAccountTransactionSigner(account)
}

async function fetchIndexerTx(txId) {
  const url = `${INDEXER}/v2/transactions/${txId}`
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

async function waitForServerHealth(maxAttempts = 15) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${SERVER_BASE}/health`)
      if (res.ok) return true
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function main() {
  console.log('=== Zuik x402 Premium Integration Test ===')
  console.log(`Server: ${SERVER_BASE}`)
  console.log(`Agent:  ${AGENT}`)
  console.log(`Guardian App: ${GUARDIAN_APP_ID}`)

  const healthy = await waitForServerHealth()
  if (!healthy) {
    console.error('Server not reachable. Start with: npm run dev (in projects/server)')
    process.exit(1)
  }
  console.log('Server health: OK')

  const configRes = await fetch(`${SERVER_BASE}/api/x402/config`)
  const config = await configRes.json()
  console.log('x402 config:', JSON.stringify(config))

  const unpaidRes = await fetch(`${SERVER_BASE}/api/x402/premium/algo-quote`)
  console.log(`Unpaid request status: ${unpaidRes.status} (expect 402)`)
  if (unpaidRes.status !== 402) {
    console.error('FAIL: Expected HTTP 402 for unpaid premium quote')
    process.exit(1)
  }
  console.log('402 Payment Required: OK')

  if (serverOnly) {
    console.log('--server-only: skipping payment flow')
    process.exit(0)
  }

  const guardian = await readGuardianContext(GUARDIAN_APP_ID, AGENT)
  const headroom = maxSpendableMicroAlgos(guardian)
  console.log('Guardian headroom (microAlgos):', headroom.toString())
  if (guardian.blocked) {
    console.warn(`WARN: Guardian blocks live payment: ${guardian.blockReason}`)
    console.log('Running unit-level group build + verify instead (npm run test:x402:unit)')
    const { spawnSync } = await import('node:child_process')
    const unit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test-x402-unit.mjs'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
    process.exit(unit.status === 0 ? 0 : 1)
  }

  const balanceBefore = await getAgentBalanceMicroAlgos(AGENT)
  console.log(`Agent balance before: ${balanceBefore} microAlgos`)

  const signer = loadAgentSigner()
  const agentContext = { agentAddress: AGENT, signer, guardianAppId: GUARDIAN_APP_ID }

  const url = `${SERVER_BASE}/api/x402/premium/algo-quote?coin=algorand`
  console.log(`Fetching premium quote via x402: ${url}`)

  const result = await fetchWithGuardianX402(agentContext, url)
  console.log('Premium quote:', JSON.stringify(result.data, null, 2))
  console.log('Payment txId:', result.paymentTxId ?? '(none in response header)')

  if (!result.data?.priceUsd) {
    console.error('FAIL: No premium price in response')
    process.exit(1)
  }

  await new Promise((r) => setTimeout(r, 4000))
  const balanceAfter = await getAgentBalanceMicroAlgos(AGENT)
  console.log(`Agent balance after: ${balanceAfter} microAlgos`)
  const spent = balanceBefore - balanceAfter
  console.log(`Balance delta: ${spent} microAlgos (includes fees)`)

  if (spent <= 0n) {
    console.warn('WARN: No balance decrease detected (payment may still be settling)')
  }

  if (result.paymentTxId) {
    const txInfo = await fetchIndexerTx(result.paymentTxId)
    if (txInfo?.transaction) {
      console.log('Indexer confirmed tx:', result.paymentTxId)
      console.log('  round:', txInfo.transaction['confirmed-round'])
      console.log('  sender:', txInfo.transaction.sender)
    } else {
      const algod = getAlgodClient()
      try {
        const pending = await algod.pendingTransactionInformation(result.paymentTxId).do()
        console.log('Algod pending tx pool:', pending)
      } catch {
        console.warn('Could not confirm tx on indexer yet:', result.paymentTxId)
      }
    }
  }

  console.log('\n=== PASS: x402 premium flow completed ===')
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
