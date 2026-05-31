/**
 * Database setup script for Agent Wallet Management tables
 * Run this script to create the required tables for agent wallet functionality
 */

import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AGENT_WALLET_TABLES_SQL } from './agentWalletRouter.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Setup] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env')
  console.error('[Setup] Please add these environment variables and try again')
  process.exit(1)
}

const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY)

async function setupTables(): Promise<void> {
  console.log('🔧 Setting up Agent Wallet Management tables...')
  
  // Since Supabase doesn't have exec_sql RPC by default, we'll show the SQL to run manually
  console.log('📋 Please run the following SQL in your Supabase SQL editor:')
  console.log('(Go to your Supabase dashboard → SQL Editor → New Query)')
  console.log('=' .repeat(80))
  console.log(AGENT_WALLET_TABLES_SQL)
  console.log('=' .repeat(80))
  
  console.log('\n✅ After running the SQL above, your Agent Wallet Management will be ready!')
  console.log('📝 You can then use the Agent Wallets section in Settings to manage your automated funds.')
}

// Alternative method using direct SQL execution if RPC doesn't work
async function setupTablesDirectSQL(): Promise<void> {
  console.log('🔧 Setting up Agent Wallet Management tables (direct SQL)...')
  
  try {
    // Split the SQL into individual statements and execute them
    const statements = AGENT_WALLET_TABLES_SQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0)
    
    for (const statement of statements) {
      if (statement.length > 0) {
        console.log(`Executing: ${statement.substring(0, 50)}...`)
        // Note: Supabase client doesn't support direct SQL execution
        // This would need to be run manually in the Supabase SQL editor
      }
    }
    
    console.log('📋 SQL statements prepared. Please run the following in your Supabase SQL editor:')
    console.log('=' .repeat(80))
    console.log(AGENT_WALLET_TABLES_SQL)
    console.log('=' .repeat(80))
    
  } catch (error) {
    console.error('❌ Setup preparation failed:', error)
  }
}

async function main() {
  console.log('🚀 Agent Wallet Management Database Setup')
  console.log('==========================================\n')
  
  await setupTables()
}

main().catch(console.error)