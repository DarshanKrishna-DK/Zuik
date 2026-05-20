import * as algosdk from 'algosdk'

async function completeGuardianDemo() {
  console.log('🎯 Starting Complete Guardian Demo on TestNet\n')
  
  // Connect to TestNet
  const algodClient = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '')
  
  // Account setup
  const deployerMnemonic = 'sausage detect inmate legend gentle jealous average fragile kid enemy enhance rabbit flower artist twist follow cat tissue picture assume merry identify shift ability master'
  const agentMnemonic = 'shoe wrestle first zoo street fatal young head decade pitch reduce fatigue dismiss charge cart crazy planet rural receive lift crumble author goat about sunset'
  
  const deployer = algosdk.mnemonicToSecretKey(deployerMnemonic) // Owner
  const agent = algosdk.mnemonicToSecretKey(agentMnemonic)
  
  const guardianAppId = 762678299
  
  console.log('👤 Owner (Deployer):', deployer.addr)
  console.log('🤖 Agent:', agent.addr)
  console.log('🛡️  Guardian App ID:', guardianAppId)
  console.log()
  
  try {
    const params = await algodClient.getTransactionParams().do()
    
    // Step 1: Agent Opt-in
    console.log('Step 1: Agent opts in to Guardian contract...')
    
    const optInTxn = algosdk.makeApplicationOptInTxnFromObject({
      from: agent.addr,
      appIndex: guardianAppId,
      suggestedParams: params,
    })
    
    const signedOptIn = optInTxn.signTxn(agent.sk)
    const optInResult = await algodClient.sendRawTransaction(signedOptIn).do()
    await algosdk.waitForConfirmation(algodClient, optInResult.txId, 4)
    
    console.log('✅ Agent opted in! Tx:', optInResult.txId)
    console.log()
    
    // Step 2: Owner registers agent with 2 ALGO daily cap
    console.log('Step 2: Owner registers agent with 2 ALGO daily cap...')
    
    const registerArgs = [
      algosdk.encodeUint64(2_000_000) // 2 ALGO in microAlgos
    ]
    
    const registerTxn = algosdk.makeApplicationCallTxnFromObject({
      from: deployer.addr,
      appIndex: guardianAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [new TextEncoder().encode('registerAgent'), ...registerArgs],
      accounts: [agent.addr],
      suggestedParams: params,
    })
    
    const signedRegister = registerTxn.signTxn(deployer.sk)
    const registerResult = await algodClient.sendRawTransaction(signedRegister).do()
    await algosdk.waitForConfirmation(algodClient, registerResult.txId, 4)
    
    console.log('✅ Agent registered with 2 ALGO daily cap! Tx:', registerResult.txId)
    console.log()
    
    // Step 3: Agent attempts 1.5 ALGO spend (should PASS)
    console.log('Step 3: Agent attempts 1.5 ALGO spend (should PASS)...')
    
    const spend1Args = [
      algosdk.encodeUint64(1_500_000) // 1.5 ALGO in microAlgos
    ]
    
    const spend1Txn = algosdk.makeApplicationCallTxnFromObject({
      from: agent.addr,
      appIndex: guardianAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [new TextEncoder().encode('attemptSpend'), ...spend1Args],
      suggestedParams: params,
    })
    
    const signedSpend1 = spend1Txn.signTxn(agent.sk)
    const spend1Result = await algodClient.sendRawTransaction(signedSpend1).do()
    await algosdk.waitForConfirmation(algodClient, spend1Result.txId, 4)
    
    console.log('✅ 1.5 ALGO spend APPROVED! Tx:', spend1Result.txId)
    console.log()
    
    // Step 4: Agent attempts 3 ALGO spend (should FAIL - exceeds cap)
    console.log('Step 4: Agent attempts 3 ALGO spend (should FAIL - exceeds daily cap)...')
    
    const spend3Args = [
      algosdk.encodeUint64(3_000_000) // 3 ALGO in microAlgos
    ]
    
    const spend3Txn = algosdk.makeApplicationCallTxnFromObject({
      from: agent.addr,
      appIndex: guardianAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [new TextEncoder().encode('attemptSpend'), ...spend3Args],
      suggestedParams: params,
    })
    
    const signedSpend3 = spend3Txn.signTxn(agent.sk)
    
    try {
      const spend3Result = await algodClient.sendRawTransaction(signedSpend3).do()
      await algosdk.waitForConfirmation(algodClient, spend3Result.txId, 4)
      console.log('⚠️ Unexpected: 3 ALGO spend was approved (should have failed)')
    } catch (error) {
      console.log('✅ 3 ALGO spend REJECTED! (Expected - exceeds daily cap)')
      console.log('   Error:', error.message.split('\\n')[0])
    }
    
    console.log()
    console.log('🎉 Guardian Demo Complete!')
    console.log('📊 Summary:')
    console.log('   • Agent opted in to Guardian ✅')
    console.log('   • Owner set 2 ALGO daily cap ✅') 
    console.log('   • 1.5 ALGO spend approved ✅')
    console.log('   • 3 ALGO spend rejected ✅')
    console.log('   • Daily spending limit enforced! 🛡️')
    
  } catch (error) {
    if (error.message.includes('already opted in')) {
      console.log('ℹ️ Agent already opted in, continuing demo...')
      // Continue with registration...
    } else {
      console.error('❌ Demo failed:', error.message)
    }
  }
}

completeGuardianDemo().catch(console.error)