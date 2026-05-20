import { AlgorandClient } from '@algorandfoundation/algokit-utils/types/algorand-client'
import { algo } from '@algorandfoundation/algokit-utils'
import * as algosdk from 'algosdk'
import dotenv from 'dotenv'

dotenv.config()

async function fundAgent() {
  // Initialize Algorand client for TestNet  
  const algorand = AlgorandClient.testNet()

  // Get deployer account from mnemonic
  const deployerMnemonic = process.env.DEPLOYER_MNEMONIC
  if (!deployerMnemonic) {
    throw new Error('DEPLOYER_MNEMONIC not found in environment')
  }

  const deployer = algosdk.mnemonicToSecretKey(deployerMnemonic)
  
  // Register the deployer account with the client
  algorand.setSignerFromAccount(deployer)
  
  console.log('Deployer address:', deployer.addr)

  // Generate agent account
  const agent = algosdk.generateAccount()
  console.log('Agent address:', agent.addr)
  console.log('Agent mnemonic:', algosdk.secretKeyToMnemonic(agent.sk))

  // Fund agent with 5 ALGO using ensureFunded
  const fundResult = await algorand.account.ensureFunded(
    agent.addr, 
    deployer.addr, 
    algo(5)
  )

  console.log('✅ Agent funded successfully!')
  console.log('Funding transaction ID:', fundResult.txIds[0])
  console.log('🔑 Agent Address:', agent.addr)
  console.log('🔑 Agent Mnemonic (save for testing):', algosdk.secretKeyToMnemonic(agent.sk))
}

fundAgent().catch(console.error)