/**
 * Check Guardian policy state and print renewal instructions.
 * On-chain renewal requires the Guardian owner wallet - use Agent Management UI
 * "Renew policy" or sign bootstrap with GUARDIAN_OWNER_MNEMONIC.
 *
 * Usage: node scripts/renew-guardian-policy.mjs [agentAddress]
 */
import 'dotenv/config'
import { readGuardianContext } from '../guardianPolicy.js'

const AGENT =
  process.argv[2] ??
  process.env.X402_TEST_AGENT ??
  '2745CL2UWWO5LM2FKWGKCVVCG2FGD6RZMA7ALPTFTBEYO7X6ABW2QC7WM4'
const APP_ID = Number(process.env.GUARDIAN_APP_ID ?? 763727553)

console.log('Checking Guardian policy...')
console.log('Agent:', AGENT)
console.log('Guardian app:', APP_ID)

const ctx = await readGuardianContext(APP_ID, AGENT)
console.log(
  JSON.stringify(ctx, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
)

if (ctx.blocked && ctx.blockReason?.includes('expired')) {
  console.log('\nPolicy is EXPIRED. Bootstrap re-registers (overwrites) the policy box.')
  console.log('Renew options:')
  console.log('  1. Settings > Agent Management > Renew policy (owner wallet signs)')
  console.log('  2. Set GUARDIAN_OWNER_MNEMONIC and run a signed bootstrap from your owner tooling')
  console.log('\nNote: There is no delete method - bootstrap replaces the existing policy in-place.')
} else if (ctx.blocked) {
  console.log('\nPolicy blocked:', ctx.blockReason)
} else {
  console.log('\nPolicy is active - no renewal needed.')
}
