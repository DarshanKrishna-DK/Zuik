import 'dotenv/config'
import algosdk from 'algosdk'
import { getAlgodClient } from '../algorand.js'
import { readGuardianContext } from '../guardianPolicy.js'

const AGENT = process.argv[2] ?? '2745CL2UWWO5LM2FKWGKCVVCG2FGD6RZMA7ALPTFTBEYO7X6ABW2QC7WM4'
const APP = Number(process.env.GUARDIAN_APP_ID ?? 763727553)

const enc = new TextEncoder()
const name = new Uint8Array([...enc.encode('pol'), ...algosdk.decodeAddress(AGENT).publicKey])

try {
  const box = await getAlgodClient().getApplicationBoxByName(APP, name).do()
  console.log('policy box bytes:', box.value.length)
  console.log('hex:', Buffer.from(box.value).toString('hex'))
} catch (e) {
  console.error('box read error:', e instanceof Error ? e.message : e)
}

const ctx = await readGuardianContext(APP, AGENT)
console.log('context:', JSON.stringify(ctx, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
