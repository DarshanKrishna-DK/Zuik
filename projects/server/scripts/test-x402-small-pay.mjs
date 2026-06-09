import 'dotenv/config'
import algosdk from 'algosdk'
import fs from 'node:fs'
import path from 'node:path'
import { sendAuthorizedPayment } from '../guardianExecutor.js'

const AGENT = '2745CL2UWWO5LM2FKWGKCVVCG2FGD6RZMA7ALPTFTBEYO7X6ABW2QC7WM4'
const RECIPIENT = 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'

const ksPath = path.resolve(process.cwd(), '.keystore.json')
const ks = JSON.parse(fs.readFileSync(ksPath, 'utf8'))
const signer = algosdk.makeBasicAccountTransactionSigner(algosdk.mnemonicToSecretKey(ks[AGENT]))

try {
  const res = await sendAuthorizedPayment({
    agentAddress: AGENT,
    recipient: RECIPIENT,
    amountMicroAlgos: 10_000,
    guardianAppId: 763727553,
    signer,
    note: 'x402-small-test',
  })
  console.log('SUCCESS', res)
} catch (e) {
  console.error('FAIL', e instanceof Error ? e.message : e)
}
