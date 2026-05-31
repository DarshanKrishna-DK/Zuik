import { getAlgodClient } from './algorand'
import { listLogicSigVaults, type LogicSigVaultRow } from './logicSigDelegation'
import { getSupabase, isSupabaseConfigured } from './supabase'

export interface AgentWalletBalance {
  balance: number
  minBalance: number
  available: number
  usdValue?: number
}

export interface AgentWalletStats {
  totalFunded: number
  totalSpent: number
  transactionCount: number
  lastActivity?: string
  dailySpending: number
  weeklySpending: number
}

export interface AgentWalletActivity {
  txId: string
  type: 'funding' | 'delegation' | 'deactivation'
  amount: number
  timestamp: string
  status: 'confirmed' | 'pending' | 'failed'
  fromAddress?: string
  toAddress?: string
}

export interface AutoFundingSettings {
  enabled: boolean
  threshold_algo: number
  funding_amount_algo: number
}

export interface EnhancedAgentWallet extends LogicSigVaultRow {
  balance?: AgentWalletBalance
  stats?: AgentWalletStats
  recentActivity?: AgentWalletActivity[]
}

async function fetchWalletBalance(lsigAddress: string): Promise<AgentWalletBalance> {
  const algod = getAlgodClient()
  try {
    const accountInfo = await algod.accountInformation(lsigAddress).do()
    const balance = Number(accountInfo.amount) / 1_000_000
    const minBalance = Number(accountInfo.minBalance || 100_000) / 1_000_000
    const available = Math.max(0, balance - minBalance)
    return { balance, minBalance, available }
  } catch {
    return { balance: 0, minBalance: 0.1, available: 0 }
  }
}

async function fetchWalletStats(lsigAddress: string): Promise<AgentWalletStats> {
  if (!isSupabaseConfigured()) {
    return { totalFunded: 0, totalSpent: 0, transactionCount: 0, dailySpending: 0, weeklySpending: 0 }
  }

  const sb = getSupabase()
  const [fundingResult, spendingResult] = await Promise.all([
    sb
      .from('agent_wallet_transactions')
      .select('amount, created_at')
      .eq('wallet_address', lsigAddress)
      .eq('transaction_type', 'funding')
      .eq('status', 'confirmed'),
    sb
      .from('agent_wallet_transactions')
      .select('amount, created_at')
      .eq('wallet_address', lsigAddress)
      .eq('transaction_type', 'delegation')
      .eq('status', 'confirmed'),
  ])

  const fundingTxns = fundingResult.data ?? []
  const spendingTxns = spendingResult.data ?? []
  const totalFunded = fundingTxns.reduce((sum, txn) => sum + Number(txn.amount), 0) / 1_000_000
  const totalSpent = spendingTxns.reduce((sum, txn) => sum + Number(txn.amount), 0) / 1_000_000

  const now = Date.now()
  const oneDayAgo = now - 24 * 60 * 60 * 1000
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000

  const dailySpending = spendingTxns
    .filter((txn) => new Date(txn.created_at).getTime() > oneDayAgo)
    .reduce((sum, txn) => sum + Number(txn.amount), 0) / 1_000_000

  const weeklySpending = spendingTxns
    .filter((txn) => new Date(txn.created_at).getTime() > oneWeekAgo)
    .reduce((sum, txn) => sum + Number(txn.amount), 0) / 1_000_000

  const lastActivity = [...fundingTxns, ...spendingTxns]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at

  return {
    totalFunded,
    totalSpent,
    transactionCount: fundingTxns.length + spendingTxns.length,
    lastActivity,
    dailySpending,
    weeklySpending,
  }
}

async function fetchWalletActivity(lsigAddress: string, limit = 10): Promise<AgentWalletActivity[]> {
  if (!isSupabaseConfigured()) return []

  const sb = getSupabase()
  const { data, error } = await sb
    .from('agent_wallet_transactions')
    .select('*')
    .eq('wallet_address', lsigAddress)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []

  return (data ?? []).map((txn) => ({
    txId: txn.transaction_id,
    type: txn.transaction_type as AgentWalletActivity['type'],
    amount: Number(txn.amount) / 1_000_000,
    timestamp: txn.created_at,
    status: txn.status as AgentWalletActivity['status'],
    fromAddress: txn.from_address ?? undefined,
    toAddress: txn.to_address ?? undefined,
  }))
}

class AgentWalletApi {
  async getWallets(walletAddress: string): Promise<EnhancedAgentWallet[]> {
    const vaults = await listLogicSigVaults(walletAddress)

    return Promise.all(
      vaults.map(async (vault) => {
        const accountAddress = vault.wallet_address
        const [balance, stats, recentActivity] = await Promise.all([
          fetchWalletBalance(accountAddress),
          fetchWalletStats(accountAddress),
          fetchWalletActivity(accountAddress),
        ])
        return { ...vault, balance, stats, recentActivity }
      }),
    )
  }

  async getAutoFundingSettings(
    walletAddress: string,
    lsigAddress: string,
  ): Promise<AutoFundingSettings | null> {
    if (!isSupabaseConfigured()) return null

    const sb = getSupabase()
    const { data, error } = await sb
      .from('agent_wallet_auto_funding')
      .select('*')
      .eq('wallet_address', walletAddress)
      .eq('lsig_address', lsigAddress)
      .maybeSingle()

    if (error || !data) return null

    return {
      enabled: Boolean(data.enabled),
      threshold_algo: Number(data.threshold_algo),
      funding_amount_algo: Number(data.funding_amount_algo),
    }
  }

  async updateAutoFundingSettings(
    walletAddress: string,
    lsigAddress: string,
    enabled: boolean,
    threshold?: number,
    fundingAmount?: number,
  ): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured')
    }

    const sb = getSupabase()
    const { error } = await sb.from('agent_wallet_auto_funding').upsert({
      wallet_address: walletAddress,
      lsig_address: lsigAddress,
      enabled,
      threshold_algo: threshold ?? 1,
      funding_amount_algo: fundingAmount ?? 5,
      updated_at: new Date().toISOString(),
    })

    if (error) throw new Error(error.message)
  }

  async recordFunding(
    walletAddress: string,
    transactionId: string,
    amount: number,
    fromAddress: string,
  ): Promise<void> {
    if (!isSupabaseConfigured()) return

    const sb = getSupabase()
    const { error } = await sb.from('agent_wallet_transactions').insert({
      wallet_address: walletAddress,
      transaction_id: transactionId,
      transaction_type: 'funding',
      amount: String(Math.round(amount * 1_000_000)),
      status: 'confirmed',
      from_address: fromAddress,
      to_address: walletAddress,
      network: import.meta.env.VITE_ALGOD_NETWORK || 'testnet',
    })

    if (error) console.warn('Failed to record funding transaction:', error.message)
  }

  async recordDelegation(
    walletAddress: string,
    transactionId: string,
    amount: number,
    toAddress: string,
  ): Promise<void> {
    if (!isSupabaseConfigured()) return

    const sb = getSupabase()
    const { error } = await sb.from('agent_wallet_transactions').insert({
      wallet_address: walletAddress,
      transaction_id: transactionId,
      transaction_type: 'delegation',
      amount: String(Math.round(amount * 1_000_000)),
      status: 'confirmed',
      from_address: walletAddress,
      to_address: toAddress,
      network: import.meta.env.VITE_ALGOD_NETWORK || 'testnet',
    })

    if (error) console.warn('Failed to record delegation transaction:', error.message)
  }
}

export const agentWalletApi = new AgentWalletApi()
