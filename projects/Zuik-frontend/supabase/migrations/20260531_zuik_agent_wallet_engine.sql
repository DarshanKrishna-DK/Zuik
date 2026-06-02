-- Zuik agent-wallet execution engine migration.
-- Applied to Supabase project kmokzptieczcyziekznk via the Supabase MCP on 2026-05-31.
-- Removes the LogicSig delegation tables and adds the funded agent sub-account model.
-- The agent SECRET is never stored here (server keystore only).

-- Remove LogicSig delegation tables (feature removed)
DROP TABLE IF EXISTS logic_sig_vaults CASCADE;
DROP TABLE IF EXISTS agent_wallet_transactions CASCADE;
DROP TABLE IF EXISTS agent_wallet_auto_funding CASCADE;

-- Funded agent sub-account model
CREATE TABLE IF NOT EXISTS agent_wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID,
  wallet_address TEXT NOT NULL,
  agent_address TEXT NOT NULL UNIQUE,
  guardian_app_id BIGINT,
  budget_microalgos BIGINT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own agent wallets" ON agent_wallets;
CREATE POLICY "Users see own agent wallets"
  ON agent_wallets FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users manage own agent wallets" ON agent_wallets;
CREATE POLICY "Users manage own agent wallets"
  ON agent_wallets FOR ALL
  USING (true);

CREATE INDEX IF NOT EXISTS idx_agent_wallets_wallet_address ON agent_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_workflow_id ON agent_wallets(workflow_id);

-- Link a due schedule to its agent sub-account (used by the headless poller).
ALTER TABLE workflow_schedules ADD COLUMN IF NOT EXISTS agent_address TEXT;
