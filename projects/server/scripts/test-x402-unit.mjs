/**
 * Unit-level x402 + Guardian checks (no live payment if policy blocks).
 */
import 'dotenv/config'
import algosdk from 'algosdk'
import fs from 'node:fs'
import path from 'node:path'
import { buildSignedGuardianAlgoPaymentGroup } from '../guardianPaymentGroup.js'
import { GuardianExactAvmFacilitatorScheme, createZuikFacilitatorSigner } from '../guardianX402Scheme.js'
import { readGuardianContext, maxSpendableMicroAlgos } from '../guardianPolicy.js'
import { ALGORAND_TESTNET_CAIP2 } from '@x402-avm/avm'

const AGENT = process.env.X402_TEST_AGENT
  ?? '2745CL2UWWO5LM2FKWGKCVVCG2FGD6RZMA7ALPTFTBEYO7X6ABW2QC7WM4'
const PAYTO = process.env.X402_PAYTO_ADDRESS
  ?? 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'
const GUARDIAN_APP_ID = Number(process.env.GUARDIAN_APP_ID ?? 763727553)
const AMOUNT = process.env.X402_PREMIUM_PRICE_MICROALGOS ?? '10000'

const ksPath = path.resolve(process.cwd(), process.env.ZUIK_KEYSTORE_FILE ?? '.keystore.json')
const ks = JSON.parse(fs.readFileSync(ksPath, 'utf8'))
const signer = algosdk.makeBasicAccountTransactionSigner(algosdk.mnemonicToSecretKey(ks[AGENT]))

const guardian = await readGuardianContext(GUARDIAN_APP_ID, AGENT)
console.log('Guardian:', JSON.stringify(guardian, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))

const { paymentGroup, paymentIndex } = await buildSignedGuardianAlgoPaymentGroup({
  agentAddress: AGENT,
  recipient: PAYTO,
  amountMicroAlgos: AMOUNT,
  guardianAppId: GUARDIAN_APP_ID,
  signer,
  note: 'x402-unit-test',
})

console.log(`Built Guardian payment group: ${paymentGroup.length} txns, paymentIndex=${paymentIndex}`)
if (paymentGroup.length < 2) {
  console.error('FAIL: expected pay + authorize_trade group')
  process.exit(1)
}

const requirements = {
  scheme: 'exact',
  network: ALGORAND_TESTNET_CAIP2,
  asset: '0',
  amount: AMOUNT,
  payTo: PAYTO,
  maxTimeoutSeconds: 120,
  extra: { name: 'ALGO', decimals: 6 },
}

const payload = {
  x402Version: 2,
  payload: { paymentGroup, paymentIndex },
}

const facilitatorScheme = new GuardianExactAvmFacilitatorScheme(createZuikFacilitatorSigner(), GUARDIAN_APP_ID)
const verify = await facilitatorScheme.verify(payload, requirements)
console.log('Facilitator verify:', verify)

if (!verify.isValid) {
  if (guardian.blocked) {
    console.log('SKIP live settle: Guardian policy blocks agent (' + guardian.blockReason + ')')
    console.log('PASS unit: group built; on-chain blocked as expected for expired/limited policy')
    process.exit(0)
  }
  console.error('FAIL: verify failed unexpectedly')
  process.exit(1)
}

const settle = await facilitatorScheme.settle(payload, requirements)
console.log('Settle:', settle)
if (!settle.success) {
  console.error('FAIL: settlement failed', settle.errorReason)
  process.exit(1)
}
console.log('PASS: on-chain settlement', settle.transaction)
