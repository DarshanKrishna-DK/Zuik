import express from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createValidatedSupabaseClient } from './supabaseClient.js'
import algosdk from 'algosdk'
import { getAlgodClient } from './algorand.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''

let sb: SupabaseClient
interface AgentWalletBalance {
  balance: number
  minBalance: number
  available: number
  usdValue?: number
}

interface AgentWalletStats {
  totalFunded: number
  totalSpent: number
  transactionCount: number
  lastActivity?: string
  dailySpending: number
  weeklySpending: number
}

interface AgentWalletActivity {
  txId: string
  type: 'funding' | 'delegation' | 'deactivation'
  amount: number
  timestamp: string
  status: 'confirmed' | 'pending' | 'failed'
  fromAddress?: string
  toAddress?: string
}

async function fetchWalletBalance(lsigAddress: string): Promise<AgentWalletBalance> {
  const algod = getAlgodClient()
  try {
    const accountInfo = await algod.accountInformation(lsigAddress).do()
    const balance = Number(accountInfo.amount) / 1_000_000 // Convert to ALGO
    const minBalance = Number(accountInfo.minBalance || 100_000) / 1_000_000
    const available = Math.max(0, balance - minBalance)
    
    return {
      balance,
      minBalance,
      available,
      // TODO: Add USD value conversion using price API
    }
  } catch (error) {
    console.warn(`Failed to fetch balance for ${lsigAddress}:`, error)
    return {
      balance: 0,
      minBalance: 0.1,
      available: 0,
    }
  }
}

async function fetchWalletStats(lsigAddress: string): Promise<AgentWalletStats> {
  try {
    // Query funding transactions from the database
    const { data: fundingTxns, error: fundingError } = await sb
      .from('agent_wallet_transactions')
      .select('amount, created_at')
      .eq('wallet_address', lsigAddress)
      .eq('transaction_type', 'funding')
      .eq('status', 'confirmed')

    if (fundingError) {
      console.warn(`Failed to fetch funding stats for ${lsigAddress}:`, fundingError)
    }

    // Query spending transactions
    const { data: spendingTxns, error: spendingError } = await sb
      .from('agent_wallet_transactions')
      .select('amount, created_at')
      .eq('wallet_address', lsigAddress)
      .eq('transaction_type', 'delegation')
      .eq('status', 'confirmed')

    if (spendingError) {
      console.warn(`Failed to fetch spending stats for ${lsigAddress}:`, spendingError)
    }

    const totalFunded = (fundingTxns || []).reduce((sum, txn) => sum + Number(txn.amount), 0) / 1_000_000
    const totalSpent = (spendingTxns || []).reduce((sum, txn) => sum + Number(txn.amount), 0) / 1_000_000
    const transactionCount = (fundingTxns?.length || 0) + (spendingTxns?.length || 0)

    // Calculate daily and weekly spending
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const dailySpending = (spendingTxns || [])
      .filter(txn => new Date(txn.created_at) > oneDayAgo)
      .reduce((sum, txn) => sum + Number(txn.amount), 0) / 1_000_000

    const weeklySpending = (spendingTxns || [])
      .filter(txn => new Date(txn.created_at) > oneWeekAgo)
      .reduce((sum, txn) => sum + Number(txn.amount), 0) / 1_000_000

    const lastActivity = [...(fundingTxns || []), ...(spendingTxns || [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at

    return {
      totalFunded,
      totalSpent,
      transactionCount,
      lastActivity,
      dailySpending,
      weeklySpending,
    }
  } catch (error) {
    console.warn(`Failed to fetch wallet stats for ${lsigAddress}:`, error)
    return {
      totalFunded: 0,
      totalSpent: 0,
      transactionCount: 0,
      dailySpending: 0,
      weeklySpending: 0,
    }
  }
}

async function fetchWalletActivity(lsigAddress: string, limit = 10): Promise<AgentWalletActivity[]> {
  try {
    const { data: transactions, error } = await sb
      .from('agent_wallet_transactions')
      .select('*')
      .eq('wallet_address', lsigAddress)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn(`Failed to fetch wallet activity for ${lsigAddress}:`, error)
      return []
    }

    return (transactions || []).map(txn => ({
      txId: txn.transaction_id,
      type: txn.transaction_type as 'funding' | 'delegation' | 'deactivation',
      amount: Number(txn.amount) / 1_000_000, // Convert to ALGO
      timestamp: txn.created_at,
      status: txn.status as 'confirmed' | 'pending' | 'failed',
      fromAddress: txn.from_address,
      toAddress: txn.to_address,
    }))
  } catch (error) {
    console.warn(`Failed to fetch wallet activity for ${lsigAddress}:`, error)
    return []
  }
}

async function recordTransaction(
  walletAddress: string,
  transactionId: string,
  transactionType: 'funding' | 'delegation' | 'deactivation',
  amount: number,
  status: 'confirmed' | 'pending' | 'failed' = 'confirmed',
  fromAddress?: string,
  toAddress?: string
): Promise<void> {
  try {
    const { error } = await sb
      .from('agent_wallet_transactions')
      .insert({
        wallet_address: walletAddress,
        transaction_id: transactionId,
        transaction_type: transactionType,
        amount: amount.toString(),
        status,
        from_address: fromAddress,
        to_address: toAddress,
        network: process.env.ALGOD_NETWORK || 'testnet',
      })

    if (error) {
      console.error('Failed to record transaction:', error)
    }
  } catch (error) {
    console.error('Failed to record transaction:', error)
  }
}

export async function createAgentWalletRouter(): Promise<express.Router> {
  if (!sb) {
    sb = await createValidatedSupabaseClient()
  }
  const router = express.Router()
  // Get enhanced wallet data with balance, stats, and activity
  router.get('/wallets/:walletAddress', async (req, res) => {
    try {
      const { walletAddress } = req.params
      
      // Get LogicSig vaults for the wallet
      const { data: vaults, error } = await sb
        .from('logic_sig_vaults')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: false })

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch wallets' })
      }

      // Enhance each vault with balance, stats, and activity
      const enhancedVaults = await Promise.all(
        (vaults || []).map(async (vault) => {
          const accountAddress = vault.wallet_address
          const [balance, stats, activity] = await Promise.all([
            fetchWalletBalance(accountAddress),
            fetchWalletStats(accountAddress),
            fetchWalletActivity(accountAddress),
          ])

          return {
            ...vault,
            balance,
            stats,
            recentActivity: activity,
          }
        })
      )

      res.json({ wallets: enhancedVaults })
    } catch (error) {
      console.error('Agent wallet fetch error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Get balance for a specific agent wallet
  router.get('/balance/:lsigAddress', async (req, res) => {
    try {
      const { lsigAddress } = req.params
      const balance = await fetchWalletBalance(lsigAddress)
      res.json({ balance })
    } catch (error) {
      console.error('Balance fetch error:', error)
      res.status(500).json({ error: 'Failed to fetch balance' })
    }
  })

  // Get stats for a specific agent wallet
  router.get('/stats/:lsigAddress', async (req, res) => {
    try {
      const { lsigAddress } = req.params
      const stats = await fetchWalletStats(lsigAddress)
      res.json({ stats })
    } catch (error) {
      console.error('Stats fetch error:', error)
      res.status(500).json({ error: 'Failed to fetch stats' })
    }
  })

  // Get activity for a specific agent wallet
  router.get('/activity/:lsigAddress', async (req, res) => {
    try {
      const { lsigAddress } = req.params
      const limit = parseInt(req.query.limit as string) || 20
      const activity = await fetchWalletActivity(lsigAddress, limit)
      res.json({ activity })
    } catch (error) {
      console.error('Activity fetch error:', error)
      res.status(500).json({ error: 'Failed to fetch activity' })
    }
  })

  // Record a funding transaction
  router.post('/record-funding', async (req, res) => {
    try {
      const { walletAddress, transactionId, amount, fromAddress } = req.body

      if (!walletAddress || !transactionId || !amount) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      await recordTransaction(
        walletAddress,
        transactionId,
        'funding',
        Number(amount) * 1_000_000, // Convert to microALGO
        'confirmed',
        fromAddress,
        walletAddress
      )

      res.json({ success: true })
    } catch (error) {
      console.error('Record funding error:', error)
      res.status(500).json({ error: 'Failed to record funding' })
    }
  })

  // Record a delegation transaction
  router.post('/record-delegation', async (req, res) => {
    try {
      const { walletAddress, transactionId, amount, toAddress } = req.body

      if (!walletAddress || !transactionId || !amount) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      await recordTransaction(
        walletAddress,
        transactionId,
        'delegation',
        Number(amount) * 1_000_000, // Convert to microALGO
        'confirmed',
        walletAddress,
        toAddress
      )

      res.json({ success: true })
    } catch (error) {
      console.error('Record delegation error:', error)
      res.status(500).json({ error: 'Failed to record delegation' })
    }
  })

  // Get auto-funding settings for a wallet
  router.get('/auto-funding/:walletAddress/:lsigAddress', async (req, res) => {
    try {
      const { walletAddress, lsigAddress } = req.params

      const { data: settings, error } = await sb
        .from('agent_wallet_auto_funding')
        .select('*')
        .eq('wallet_address', walletAddress)
        .eq('lsig_address', lsigAddress)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Failed to fetch auto-funding settings' })
      }

      res.json({ settings: settings || null })
    } catch (error) {
      console.error('Auto-funding fetch error:', error)
      res.status(500).json({ error: 'Failed to fetch auto-funding settings' })
    }
  })

  // Update auto-funding settings for a wallet
  router.post('/auto-funding', async (req, res) => {
    try {
      const { walletAddress, lsigAddress, enabled, threshold, fundingAmount } = req.body

      if (!walletAddress || !lsigAddress) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const { error } = await sb
        .from('agent_wallet_auto_funding')
        .upsert({
          wallet_address: walletAddress,
          lsig_address: lsigAddress,
          enabled: Boolean(enabled),
          threshold_algo: threshold ? Number(threshold) : 1,
          funding_amount_algo: fundingAmount ? Number(fundingAmount) : 5,
          updated_at: new Date().toISOString(),
        })

      if (error) {
        return res.status(500).json({ error: 'Failed to update auto-funding settings' })
      }

      res.json({ success: true })
    } catch (error) {
      console.error('Auto-funding update error:', error)
      res.status(500).json({ error: 'Failed to update auto-funding settings' })
    }
  })

  return router
}

// Database table creation SQL (run this to set up the required tables)
export const AGENT_WALLET_TABLES_SQL = `
-- Agent wallet transaction history
CREATE TABLE IF NOT EXISTS agent_wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('funding', 'delegation', 'deactivation')),
  amount TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'failed')),
  from_address TEXT,
  to_address TEXT,
  network TEXT NOT NULL DEFAULT 'testnet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, network)
);

-- Auto-funding settings
CREATE TABLE IF NOT EXISTS agent_wallet_auto_funding (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  lsig_address TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  threshold_algo DECIMAL NOT NULL DEFAULT 1.0,
  funding_amount_algo DECIMAL NOT NULL DEFAULT 5.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_address, lsig_address)
);

-- Enable row level security
ALTER TABLE agent_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_wallet_auto_funding ENABLE ROW LEVEL SECURITY;

-- Create policies for agent wallet transactions
CREATE POLICY "Users see own agent wallet transactions"
  ON agent_wallet_transactions FOR SELECT
  USING (true);

CREATE POLICY "Users manage own agent wallet transactions"
  ON agent_wallet_transactions FOR ALL
  USING (true);

-- Create policies for auto-funding settings
CREATE POLICY "Users see own auto-funding settings"
  ON agent_wallet_auto_funding FOR SELECT
  USING (true);

CREATE POLICY "Users manage own auto-funding settings"
  ON agent_wallet_auto_funding FOR ALL
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_agent_wallet_transactions_wallet_address ON agent_wallet_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_agent_wallet_transactions_created_at ON agent_wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_wallet_auto_funding_wallet_lsig ON agent_wallet_auto_funding(wallet_address, lsig_address);
`