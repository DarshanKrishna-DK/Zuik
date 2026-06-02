#!/usr/bin/env node
/**
 * TestNet on-chain checks for Zuik Guardian MVP.
 * Usage: node scripts/onchain-verify.mjs --agent <ADDRESS> [--recipient ADDR] [--app-id N]
 */
import algosdk from 'algosdk'

const DEFAULT_APP_ID = 763727553
const DEFAULT_RECIPIENT =
  'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'

const ALGOD_SERVER = process.env.VITE_ALGOD_SERVER || 'https://testnet-api.4160.nodely.dev'
const ALGOD_TOKEN = process.env.VITE_ALGOD_TOKEN || ''
const INDEXER_SERVER =
  process.env.VITE_INDEXER_SERVER || 'https://testnet-idx.4160.nodely.dev'
const INDEXER_TOKEN = process.env.VITE_INDEXER_TOKEN || ''

function parseArgs(argv) {
  const out = { agent: '', recipient: DEFAULT_RECIPIENT, appId: DEFAULT_APP_ID }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--agent' && argv[i + 1]) out.agent = argv[++i]
    else if (argv[i] === '--recipient' && argv[i + 1]) out.recipient = argv[++i]
    else if (argv[i] === '--app-id' && argv[i + 1]) out.appId = Number(argv[++i])
  }
  return out
}

function boxMapKey(prefix, address) {
  const addrBytes = algosdk.decodeAddress(address)
  return new Uint8Array([...new TextEncoder().encode(prefix), ...addrBytes.publicKey])
}

async function readBox(algod, appId, nameBytes) {
  try {
    const res = await algod.getApplicationBoxByName(appId, nameBytes).do()
    return res.value
  } catch {
    return null
  }
}

function decodePolicyBox(raw) {
  if (!raw || raw.length < 56) return null
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  let o = 0
  const readU64 = () => {
    const v = view.getBigUint64(o, false)
    o += 8
    return v
  }
  return {
    maxPerTradeMicroAlgos: readU64(),
    dailyCapMicroAlgos: readU64(),
    dailySpentMicroAlgos: readU64(),
    dayResetRound: readU64(),
    expiryRound: readU64(),
    executionsRemaining: readU64(),
    allowedDexAppId: readU64(),
    allowedAssetId: readU64(),
  }
}

function decodeAllowedRecipient(raw) {
  if (!raw || raw.length === 0) return false
  return raw[raw.length - 1] !== 0
}

async function main() {
  const { agent, recipient, appId } = parseArgs(process.argv)
  if (!agent) {
    console.error('Usage: node scripts/onchain-verify.mjs --agent <AGENT_ADDRESS>')
    process.exit(1)
  }

  const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, '')
  const indexer = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_SERVER, '')

  await algod.status().do()

  const appInfo = await algod.getApplicationByID(appId).do()
  const globals = appInfo.params['global-state'] || []
  const globalMap = Object.fromEntries(
    globals.map((g) => {
      const key = Buffer.from(g.key, 'base64').toString('utf8')
      const val = g.value.uint !== undefined ? g.value.uint : g.value.bytes
      return [key, val]
    }),
  )

  const policyRaw = await readBox(algod, appId, boxMapKey('pol', agent))
  const policy = decodePolicyBox(policyRaw ? new Uint8Array(Buffer.from(policyRaw, 'base64')) : null)

  const rcvRaw = await readBox(algod, appId, boxMapKey('rcv', recipient))
  const recipientAllowed = decodeAllowedRecipient(
    rcvRaw ? new Uint8Array(Buffer.from(rcvRaw, 'base64')) : null,
  )

  const agentInfo = await algod.accountInformation(agent).do()
  const balanceMicro = BigInt(agentInfo.amount)

  let recentPayToRecipient = null
  try {
    const txns = await indexer
      .lookupAccountTransactions(recipient)
      .txType('pay')
      .limit(20)
      .do()
    const match = (txns.transactions || []).find(
      (t) => t.sender === agent && t.paymentTransaction?.amount >= 50_000,
    )
    if (match) {
      recentPayToRecipient = {
        id: match.id,
        amountMicro: match.paymentTransaction?.amount,
        round: match['confirmed-round'],
      }
    }
  } catch {
    /* indexer optional */
  }

  const report = {
    network: 'testnet',
    appId,
    agent,
    recipient,
    globalMap,
    policy: policy
      ? {
          maxPerTradeAlgo: Number(policy.maxPerTradeMicroAlgos) / 1e6,
          dailyCapAlgo: Number(policy.dailyCapMicroAlgos) / 1e6,
          dailySpentAlgo: Number(policy.dailySpentMicroAlgos) / 1e6,
          executionsRemaining: Number(policy.executionsRemaining),
          allowedAssetId: Number(policy.allowedAssetId),
        }
      : null,
    recipientAllowed,
    agentBalanceAlgo: Number(balanceMicro) / 1e6,
    recentPayToRecipient,
  }

  console.log(JSON.stringify(report, null, 2))

  const ok = Boolean(policy) && recipientAllowed && balanceMicro > 0n
  if (!ok) {
    console.error('\nVerify FAILED: need policy box, allowed recipient, and funded agent.')
    process.exit(2)
  }
  console.log('\nVerify OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
