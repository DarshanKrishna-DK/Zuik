#!/usr/bin/env node
/**
 * Real-time verification script for manual testing steps
 * Usage: node verify-testing-step.mjs [step] [data]
 */

const step = process.argv[2]
const data = process.argv[3]

const GUARDIAN_APP_ID = 763727553
const TEST_RECIPIENT = 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'

async function verifyStep(step, data) {
  console.log(`🔍 Verifying Step ${step}...`)
  
  switch (step) {
    case 'agent':
      return verifyAgentAddress(data)
    case 'transaction':
      return verifyTransaction(data)
    case 'balance':
      return verifyBalance(data)
    case 'guardian':
      return verifyGuardianContract()
    default:
      console.log('❌ Unknown step. Use: agent, transaction, balance, or guardian')
      return false
  }
}

async function verifyAgentAddress(address) {
  if (!address || address.length !== 58) {
    console.log('❌ Invalid agent address format')
    return false
  }
  
  try {
    console.log(`📋 Checking agent: ${address}`)
    
    const response = await fetch(`https://testnet-api.algonode.cloud/v2/accounts/${address}`)
    
    if (!response.ok) {
      console.log('❌ Agent address not found on TestNet')
      return false
    }
    
    const data = await response.json()
    const balance = data.amount / 1000000
    
    console.log(`✅ Agent verified on TestNet`)
    console.log(`💰 Balance: ${balance} ALGO`)
    console.log(`📊 Status: ${data.status}`)
    console.log(`🔧 Min Balance: ${data['min-balance'] / 1000000} ALGO`)
    
    if (balance >= 0.1) {
      console.log('✅ Sufficient balance for testing')
    } else {
      console.log('⚠️ Low balance - may need more funding')
    }
    
    return true
  } catch (error) {
    console.log(`❌ Error verifying agent: ${error.message}`)
    return false
  }
}

async function verifyTransaction(txId) {
  if (!txId || txId.length !== 52) {
    console.log('❌ Invalid transaction ID format')
    return false
  }
  
  try {
    console.log(`📋 Checking transaction: ${txId}`)
    
    const response = await fetch(`https://testnet-api.algonode.cloud/v2/transactions/${txId}`)
    
    if (!response.ok) {
      console.log('❌ Transaction not found or not yet confirmed')
      return false
    }
    
    const data = await response.json()
    
    console.log(`✅ Transaction confirmed`)
    console.log(`📊 Round: ${data['confirmed-round']}`)
    console.log(`💸 Type: ${data['tx-type']}`)
    
    if (data.transaction?.['payment-transaction']) {
      const payment = data.transaction['payment-transaction']
      console.log(`💰 Amount: ${payment.amount / 1000000} ALGO`)
      console.log(`📨 From: ${payment.receiver}`)
      console.log(`📤 To: ${payment.sender}`)
    }
    
    if (data.transaction?.['application-transaction']) {
      const app = data.transaction['application-transaction']
      console.log(`🔗 App ID: ${app['application-id']}`)
      console.log(`⚙️ Method: ${app['application-args'] ? 'With args' : 'Basic'}`)
    }
    
    return true
  } catch (error) {
    console.log(`❌ Error verifying transaction: ${error.message}`)
    return false
  }
}

async function verifyBalance(address) {
  if (!address || address.length !== 58) {
    console.log('❌ Invalid address format')
    return false
  }
  
  try {
    const response = await fetch(`https://testnet-api.algonode.cloud/v2/accounts/${address}`)
    const data = await response.json()
    const balance = data.amount / 1000000
    
    console.log(`💰 Current balance: ${balance} ALGO`)
    return balance
  } catch (error) {
    console.log(`❌ Error checking balance: ${error.message}`)
    return 0
  }
}

async function verifyGuardianContract() {
  try {
    console.log(`📋 Checking Guardian App: ${GUARDIAN_APP_ID}`)
    
    const response = await fetch(`https://testnet-api.algonode.cloud/v2/applications/${GUARDIAN_APP_ID}`)
    const data = await response.json()
    
    if (data.deleted) {
      console.log('❌ Guardian contract is deleted')
      return false
    }
    
    console.log(`✅ Guardian contract active`)
    console.log(`👤 Creator: ${data.params.creator}`)
    console.log(`🔧 Global State Items: ${data.params['global-state']?.length || 0}`)
    
    return true
  } catch (error) {
    console.log(`❌ Error verifying Guardian: ${error.message}`)
    return false
  }
}

// Run verification if called directly
if (process.argv.length >= 3) {
  verifyStep(step, data).then(result => {
    if (result) {
      console.log(`🎉 Step ${step} verification: PASSED`)
      process.exit(0)
    } else {
      console.log(`❌ Step ${step} verification: FAILED`)
      process.exit(1)
    }
  })
} else {
  console.log('Usage: node verify-testing-step.mjs [step] [data]')
  console.log('Steps: agent, transaction, balance, guardian')
  console.log('Example: node verify-testing-step.mjs agent 2ABC...XYZ')
}