import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import algosdk from 'algosdk'

export async function deploy() {
  console.log('=== Deploying ZuikGuardian (AI Agent Governance) ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')
  console.log('Deployer address:', deployer.addr)

  const { algod } = algorand.client

  const accountInfo = await algod.accountInformation(deployer.addr).do()
  console.log('Deployer balance:', accountInfo.amount, 'microAlgos')

  if (accountInfo.amount < 1000000) {
    throw new Error('Deployer account needs at least 1 ALGO for deployment')
  }

  const fs = require('fs')
  const path = require('path')

  const approvalTealPath = path.join(__dirname, '../artifacts/guardian/ZuikGuardian.approval.teal')
  const clearTealPath = path.join(__dirname, '../artifacts/guardian/ZuikGuardian.clear.teal')

  const approvalTeal = fs.readFileSync(approvalTealPath, 'utf8')
  const clearTeal = fs.readFileSync(clearTealPath, 'utf8')

  const approvalProgram = await algod.compile(approvalTeal).do()
  const clearProgram = await algod.compile(clearTeal).do()

  const suggestedParams = await algod.getTransactionParams().do()

  const createMethod = algosdk.ABIMethod.fromSignature('createApplication()void')
  const appArgs = [createMethod.getSelector()]

  // Must match Puya output (ZuikGuardian.arc56.json)
  const createTxn = algosdk.makeApplicationCreateTxnFromObject({
    sender: deployer.addr,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    approvalProgram: new Uint8Array(Buffer.from(approvalProgram.result, 'base64')),
    clearProgram: new Uint8Array(Buffer.from(clearProgram.result, 'base64')),
    numGlobalInts: 3,
    numGlobalByteSlices: 1,
    numLocalInts: 5,
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
    throw new Error('Failed to deploy Guardian contract - no app ID returned')
  }

  console.log('Deployed Guardian app ID:', appId)

  const appAddress = algosdk.getApplicationAddress(appId)
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: deployer.addr,
    receiver: appAddress,
    amount: BigInt(500_000),
    suggestedParams,
  })

  const signedFund = await deployer.signer([fundTxn], [0])
  const fundSend = await algod.sendRawTransaction(signedFund).do()
  const fundTxId = (fundSend as { txid?: string; txId?: string }).txid ?? (fundSend as { txId: string }).txId

  console.log('Guardian app funded, transaction ID:', fundTxId)
  console.log('Guardian app address:', appAddress.toString())

  const deploymentInfo = {
    appId,
    appAddress: appAddress.toString(),
    deployerAddress: deployer.addr,
    deploymentTxId: createTxId,
    fundingTxId: fundTxId,
    deployedAt: new Date().toISOString(),
    network: process.env.ALGOD_SERVER?.includes('testnet') ? 'testnet' : 'localnet',
  }

  const deploymentPath = path.join(__dirname, '../artifacts/guardian/deployment.json')
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2))

  console.log('Guardian deployment info saved to:', deploymentPath)

  return deploymentInfo
}
