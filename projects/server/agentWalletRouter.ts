import express from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createValidatedSupabaseClient } from './supabaseClient.js'
import { getAlgodClient } from './algorand.js'
import { storeAgentKey, hasAgentKey, removeAgentKey, getAgentExecutionContext } from './agentSigner.js'
import { sendAuthorizedPayment } from './guardianExecutor.js'

let sb: SupabaseClient

interface AgentWalletBalance {
  balance: number
  minBalance: number
  available: number
}

async function fetchWalletBalance(agentAddress: string): Promise<AgentWalletBalance> {
  const algod = getAlgodClient()
  try {
    const accountInfo = await algod.accountInformation(agentAddress).do()
    const balance = Number(accountInfo.amount) / 1_000_000
    const minBalance = Number(accountInfo.minBalance || 100_000) / 1_000_000
    const available = Math.max(0, balance - minBalance)
    return { balance, minBalance, available }
  } catch (error) {
    console.warn(`[AgentWallet] Failed to fetch balance for ${agentAddress}:`, error)
    return { balance: 0, minBalance: 0.1, available: 0 }
  }
}

/**
 * REST routes for the funded agent sub-account model.
 *
 * - POST /register   stores the agent mnemonic in the server keystore (never persisted to DB)
 *                    and upserts public metadata into the agent_wallets table.
 * - GET  /:agentAddress/balance   reads the on-chain balance of an agent sub-account.
 * - GET  /by-wallet/:ownerAddress lists agent wallets owned by a connected wallet.
 *
 * The agent secret is NEVER stored in Supabase or returned to the client.
 */
export async function createAgentWalletRouter(): Promise<express.Router> {
  if (!sb) {
    sb = await createValidatedSupabaseClient()
  }
  const router = express.Router()

  router.post('/register', async (req, res) => {
    try {
      const { workflowId, ownerAddress, agentAddress, mnemonic, guardianAppId, budgetMicroAlgos } = req.body ?? {}

      if (!ownerAddress || !agentAddress || !mnemonic) {
        return res.status(400).json({ error: 'ownerAddress, agentAddress and mnemonic are required' })
      }

      // Persist the secret server-side only. Throws if the mnemonic does not derive agentAddress.
      storeAgentKey(agentAddress, mnemonic)

      // workflow_id is a UUID column; ignore non-UUID values (e.g. demo placeholders).
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const safeWorkflowId = typeof workflowId === 'string' && UUID_RE.test(workflowId) ? workflowId : null

      const { error } = await sb
        .from('agent_wallets')
        .upsert(
          {
            workflow_id: safeWorkflowId,
            wallet_address: ownerAddress,
            agent_address: agentAddress,
            guardian_app_id: guardianAppId ? Number(guardianAppId) : null,
            budget_microalgos: budgetMicroAlgos ? Number(budgetMicroAlgos) : null,
            status: 'active',
          },
          { onConflict: 'agent_address' },
        )

      if (error) {
        console.error('[AgentWallet] Failed to persist metadata:', error.message)
        return res.status(500).json({ error: 'Failed to persist agent wallet metadata' })
      }

      // Do not echo the mnemonic back.
      res.json({ success: true, agentAddress })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register agent wallet'
      console.error('[AgentWallet] register error:', message)
      res.status(500).json({ error: message })
    }
  })

  router.get('/:agentAddress/balance', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const balance = await fetchWalletBalance(agentAddress)
      res.json({ balance, hasKey: hasAgentKey(agentAddress) })
    } catch (error) {
      console.error('[AgentWallet] balance error:', error)
      res.status(500).json({ error: 'Failed to fetch balance' })
    }
  })

  router.get('/by-wallet/:ownerAddress', async (req, res) => {
    try {
      const { ownerAddress } = req.params
      const { data, error } = await sb
        .from('agent_wallets')
        .select('id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, created_at')
        .eq('wallet_address', ownerAddress)
        .order('created_at', { ascending: false })

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch agent wallets' })
      }
      res.json({ wallets: data ?? [] })
    } catch (error) {
      console.error('[AgentWallet] by-wallet error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.patch('/:agentAddress', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const { status, budgetMicroAlgos, ownerAddress } = req.body ?? {}

      if (!ownerAddress) {
        return res.status(400).json({ error: 'ownerAddress is required' })
      }

      const patch: Record<string, unknown> = {}
      if (status === 'active' || status === 'inactive' || status === 'archived') {
        patch.status = status
      }
      if (budgetMicroAlgos != null) {
        const n = Number(budgetMicroAlgos)
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: 'budgetMicroAlgos must be a non-negative number' })
        }
        patch.budget_microalgos = n
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' })
      }

      const { data, error } = await sb
        .from('agent_wallets')
        .update(patch)
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)
        .select('id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, created_at')
        .maybeSingle()

      if (error) {
        return res.status(500).json({ error: 'Failed to update agent wallet' })
      }
      if (!data) {
        return res.status(404).json({ error: 'Agent wallet not found for this owner' })
      }
      res.json({ wallet: data })
    } catch (error) {
      console.error('[AgentWallet] patch error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/:agentAddress/send-payment', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const { ownerAddress, recipient, amountMicroAlgos, assetId = 0, note } = req.body ?? {}

      if (!ownerAddress || !recipient || amountMicroAlgos == null) {
        return res.status(400).json({ error: 'ownerAddress, recipient, and amountMicroAlgos are required' })
      }

      const { data: row, error } = await sb
        .from('agent_wallets')
        .select('agent_address, wallet_address, guardian_app_id, status')
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)
        .eq('status', 'active')
        .maybeSingle()

      if (error || !row) {
        return res.status(404).json({ error: 'Agent wallet not found for this owner' })
      }

      if (Number(assetId) !== 0) {
        return res.status(400).json({ error: 'Agent path supports ALGO (asset 0) only' })
      }

      const amount = Number(amountMicroAlgos)
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'amountMicroAlgos must be a positive number' })
      }

      const agentContext = await getAgentExecutionContext(agentAddress)
      if (!agentContext) {
        return res.status(400).json({ error: 'Agent signing key not available on server' })
      }

      const result = await sendAuthorizedPayment({
        agentAddress,
        recipient: String(recipient),
        amountMicroAlgos: BigInt(Math.round(amount)),
        guardianAppId: agentContext.guardianAppId,
        signer: agentContext.signer,
        note: typeof note === 'string' ? note : undefined,
      })

      res.json({
        txIds: result.txIds,
        txId: result.txIds[0] ?? '',
        confirmedRound: result.confirmedRound,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent payment failed'
      console.error('[AgentWallet] send-payment error:', message)
      res.status(500).json({ error: message })
    }
  })

  router.delete('/:agentAddress', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const ownerAddress = (req.query.ownerAddress as string) || (req.body?.ownerAddress as string)

      if (!ownerAddress) {
        return res.status(400).json({ error: 'ownerAddress is required' })
      }

      const { error } = await sb
        .from('agent_wallets')
        .update({ status: 'archived' })
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)

      if (error) {
        return res.status(500).json({ error: 'Failed to archive agent wallet' })
      }

      removeAgentKey(agentAddress)
      res.json({ success: true })
    } catch (error) {
      console.error('[AgentWallet] delete error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
