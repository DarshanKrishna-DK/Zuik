// Live TestNet harness for the Guardian-enforced agent payment path.
// Runs Test C (over-limit -> expect Guardian rejection) then Test A (0.5 ALGO -> expect success).
// Uses the SAME executor the server uses in production.
import 'dotenv/config'
import algosdk from 'algosdk'
import fs from 'node:fs'
import path from 'node:path'
import { sendAuthorizedPayment } from '../guardianExecutor.js'

const AGENT = '2745CL2UWWO5LM2FKWGKCVVCG2FGD6RZMA7ALPTFTBEYO7X6ABW2QC7WM4'
const RECIPIENT = 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'
const GUARDIAN_APP_ID = Number(process.env.GUARDIAN_APP_ID ?? process.env.VITE_GUARDIAN_APP_ID ?? 763727553)

function loadAgentSigner() {
  const ksPath = path.resolve(process.cwd(), process.env.ZUIK_KEYSTORE_FILE ?? '.keystore.json')
  const ks = JSON.parse(fs.readFileSync(ksPath, 'utf8'))
  const mnemonic = ks[AGENT]
  if (!mnemonic) throw new Error(`No key for agent ${AGENT} in keystore ${ksPath}`)
  const account = algosdk.mnemonicToSecretKey(mnemonic)
  return algosdk.makeBasicAccountTransactionSigner(account)
}

async function run(label, amountAlgo, expect) {
  const signer = loadAgentSigner()
  const amountMicroAlgos = Math.round(amountAlgo * 1_000_000)
  console.log(`\n=== ${label}: pay ${amountAlgo} ALGO (expect ${expect}) ===`)
  try {
    const res = await sendAuthorizedPayment({
      agentAddress: AGENT,
      recipient: RECIPIENT,
      amountMicroAlgos,
      guardianAppId: GUARDIAN_APP_ID,
      signer,
      note: `zuik-test-${label}`,
    })
    console.log(`RESULT: SUCCESS txIds=${res.txIds.join(',')} round=${res.confirmedRound}`)
    return { ok: true, res }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`RESULT: REJECTED/ERROR -> ${msg}`)
    return { ok: false, error: msg }
  }
}

const which = process.argv[2] ?? 'all'
if (which === 'C' || which === 'all') await run('TestC-overlimit', 1.5, 'Guardian REJECT')
if (which === 'A' || which === 'all') await run('TestA-valid', 0.5, 'SUCCESS')
