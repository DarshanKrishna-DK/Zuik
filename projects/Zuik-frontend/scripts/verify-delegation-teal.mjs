/**
 * Verifies delegation TEAL compiles on testnet algod.
 * Run: node scripts/verify-delegation-teal.mjs
 */
import algosdk from 'algosdk'

const ALGOD_URL = process.env.VITE_ALGOD_SERVER || 'https://testnet-api.4160.nodely.dev'
const ALGOD_TOKEN = process.env.VITE_ALGOD_TOKEN || ''
const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, '')

const teal = `#pragma version 9
txn RekeyTo
global ZeroAddress
==
assert
global Round
int 999999999
<=
assert
txn Fee
int 2000
<=
assert
txn GroupIndex
int 0
==
assert
txn TypeEnum
int pay
==
bnz handle_payment
int 0
return
handle_payment:
txn Amount
int 1000000
<=
assert
txn CloseRemainderTo
global ZeroAddress
==
assert
int 1
return
`

const compiled = await algod.compile(teal).do()
const programBytes = Uint8Array.from(Buffer.from(compiled.result, 'base64'))
const lsig = new algosdk.LogicSigAccount(programBytes)

console.log('Delegation TEAL compiled successfully')
console.log('Program hash:', compiled.hash)
console.log('Contract account address (not used in delegation mode):', lsig.address())
console.log('Program length:', programBytes.length, 'bytes')
