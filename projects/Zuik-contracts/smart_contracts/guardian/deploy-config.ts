import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { ZuikGuardianFactory } from '../artifacts/guardian/ZuikGuardianClient'

export async function deploy() {
  console.log('=== Deploying ZuikGuardian (AI Agent Governance) ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')
  console.log('Deployer address:', deployer.addr.toString())

  const { algod } = algorand.client
  const accountInfo = await algod.accountInformation(deployer.addr).do()
  console.log('Deployer balance:', accountInfo.amount, 'microAlgos')

  if (accountInfo.amount < 2_000_000n) {
    throw new Error(
      `Deployer account needs at least 2 ALGO for deployment + box MBR funding. ` +
        `Fund ${deployer.addr.toString()} via the TestNet dispenser (https://bank.testnet.algorand.network/).`,
    )
  }

  const factory = algorand.client.getTypedAppFactory(ZuikGuardianFactory, {
    defaultSender: deployer.addr,
  })

  // Direct create (no indexer required): each run deploys a fresh NEW Guardian
  // that supersedes any prior one.
  const { appClient } = await factory.send.create.createApplication({ args: [] })

  const appId = Number(appClient.appId)
  const appAddress = appClient.appAddress.toString()

  console.log('Deployed Guardian app ID:', appId)
  console.log('Guardian app address:', appAddress)

  // Fund the app account so it can pay box MBR (policies + allowedRecipients boxes).
  const funding = await algorand.send.payment({
    sender: deployer.addr,
    receiver: appClient.appAddress,
    amount: (1).algo(),
  })
  console.log('Guardian app funded for box MBR, txid:', funding.txIds[0])

  const fs = require('fs')
  const path = require('path')

  const deploymentInfo = {
    appId,
    appAddress,
    deployerAddress: deployer.addr.toString(),
    deployedAt: new Date().toISOString(),
    network: process.env.ALGOD_SERVER?.includes('testnet') ? 'testnet' : 'localnet',
  }

  const deploymentPath = path.join(__dirname, '../artifacts/guardian/deployment.json')
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2))
  console.log('Guardian deployment info saved to:', deploymentPath)

  return deploymentInfo
}
