import * as algosdk from 'algosdk'

async function agentOptIn() {
  // Connect to TestNet
  const algodClient = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '')
  
  // Agent account
  const agentMnemonic = 'shoe wrestle first zoo street fatal young head decade pitch reduce fatigue dismiss charge cart crazy planet rural receive lift crumble author goat about sunset'
  const agent = algosdk.mnemonicToSecretKey(agentMnemonic)
  
  console.log('Agent address:', agent.addr)
  
  // Guardian App ID from deployment
  const guardianAppId = 762678299
  
  try {
    // Get transaction parameters
    const params = await algodClient.getTransactionParams().do()
    
    // Create opt-in transaction
    const optInTxn = algosdk.makeApplicationOptInTxn(
      agent.addr, 
      params, 
      guardianAppId
    )
    
    // Sign and send transaction
    const signedTxn = optInTxn.signTxn(agent.sk)
    const { txId } = await algodClient.sendRawTransaction(signedTxn).do()
    
    // Wait for confirmation
    await algosdk.waitForConfirmation(algodClient, txId, 4)
    
    console.log('✅ Agent successfully opted in to Guardian!')
    console.log('Transaction ID:', txId)
    console.log('Guardian App ID:', guardianAppId)
    
  } catch (error) {
    console.log('ℹ️ Opt-in result:', error.message)
    if (error.message.includes('already opted in')) {
      console.log('✅ Agent was already opted in to Guardian!')
    } else {
      console.error('❌ Opt-in failed:', error)
    }
  }
}

agentOptIn().catch(console.error)