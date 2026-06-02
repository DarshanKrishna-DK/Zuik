// Live test of the server-side AI decision layer (Groq), bounded by the real Guardian policy.
// Proves: a real Groq decision is produced and clamped to Guardian maxPerTrade; no fund movement here.
import 'dotenv/config'
import { makeAgentDecision } from '../aiAgent.js'
import { readGuardianContext } from '../guardianPolicy.js'
import { getMarketSnapshot } from '../marketSnapshot.js'
import { getAlgodClient } from '../algorand.js'

const AGENT = '2745CL2UWWO5LM2FKWGKCVVCG2FGD6RZMA7ALPTFTBEYO7X6ABW2QC7WM4'
const RECIPIENT = 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'
const GUARDIAN_APP_ID = Number(process.env.GUARDIAN_APP_ID ?? 763727553)

const guardian = await readGuardianContext(GUARDIAN_APP_ID, AGENT).catch((e) => {
  console.log('guardian read error:', e?.message)
  return null
})
console.log('Guardian context:', JSON.stringify(guardian, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))

const market = await getMarketSnapshot(0).catch(() => null)
console.log('Market snapshot:', JSON.stringify(market))

const acct = await getAlgodClient().accountInformation(AGENT).do()
const agentBalanceMicroAlgos = BigInt(acct.amount ?? 0)
console.log('Agent balance microAlgos:', agentBalanceMicroAlgos.toString())

const decision = await makeAgentDecision({
  agentAddress: AGENT,
  recipient: RECIPIENT,
  userStrategy: 'Send a small 0.2 ALGO test payment to the allowlisted recipient on every run (time-based, not market-dependent).',
  guardian,
  market,
  agentBalanceMicroAlgos,
  maxAmountAlgo: 0.3,
})
console.log('AI DECISION:', JSON.stringify(decision, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
