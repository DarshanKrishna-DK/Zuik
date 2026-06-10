import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ZuikGuardianFactory } from '../artifacts/guardian/ZuikGuardianClient'

export async function deploy() {
  console.log('Deploying ZuikGuardian...')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')
  console.log('Deployer:', deployer.addr.toString())

  const { algod } = algorand.client
  const accountInfo = await algod.accountInformation(deployer.addr).do()
  console.log('Deployer balance (microAlgos):', accountInfo.amount)

  if (accountInfo.amount < 2_000_000n) {
    throw new Error(
      `Deployer needs at least 2 ALGO for deployment and box MBR. ` +
        `Fund ${deployer.addr.toString()} on this network.`,
    )
  }

  const factory = algorand.client.getTypedAppFactory(ZuikGuardianFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient } = await factory.send.create.createApplication({ args: [] })

  const appId = Number(appClient.appId)
  const appAddress = appClient.appAddress.toString()

  console.log('Guardian app ID:', appId)
  console.log('Guardian app address:', appAddress)

  const funding = await algorand.send.payment({
    sender: deployer.addr,
    receiver: appClient.appAddress,
    amount: (1).algo(),
  })
  console.log('Funded app account for box MBR, txid:', funding.txIds[0])

  const deploymentInfo = {
    appId,
    appAddress,
    deployerAddress: deployer.addr.toString(),
    deployedAt: new Date().toISOString(),
    network: process.env.ALGOD_SERVER?.includes('testnet') ? 'testnet' : 'localnet',
  }

  const deploymentPath = path.join(__dirname, '../artifacts/guardian/deployment.json')
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true })
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2))
  console.log('Wrote deployment info to:', deploymentPath)

  return deploymentInfo
}
