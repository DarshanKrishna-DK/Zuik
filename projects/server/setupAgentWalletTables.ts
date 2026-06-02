/**
 * Database setup helper for the funded agent sub-account model.
 * Prints the SQL to create the agent_wallets table (run it in the Supabase SQL editor).
 * The agent SECRET is never stored here - only public metadata.
 */

import 'dotenv/config'

export const AGENT_WALLETS_TABLE_SQL = `
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

CREATE POLICY "Users see own agent wallets"
  ON agent_wallets FOR SELECT
  USING (true);

CREATE POLICY "Users manage own agent wallets"
  ON agent_wallets FOR ALL
  USING (true);

CREATE INDEX IF NOT EXISTS idx_agent_wallets_wallet_address ON agent_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_workflow_id ON agent_wallets(workflow_id);

-- Link a due schedule to its agent sub-account (used by the headless poller).
ALTER TABLE workflow_schedules ADD COLUMN IF NOT EXISTS agent_address TEXT;
`

function main() {
  console.log('Agent Wallet Database Setup (funded agent sub-account model)')
  console.log('===========================================================\n')
  console.log('Run the following SQL in your Supabase SQL editor:')
  console.log('='.repeat(80))
  console.log(AGENT_WALLETS_TABLE_SQL)
  console.log('='.repeat(80))
}

main()
