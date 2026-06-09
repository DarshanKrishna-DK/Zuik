-- Unified Agent Management: policy templates and agent-policy bindings.

CREATE TABLE IF NOT EXISTS policy_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  max_per_trade_microalgos BIGINT NOT NULL,
  daily_cap_microalgos BIGINT NOT NULL,
  daily_executions_cap BIGINT NOT NULL,
  expiry_round_horizon BIGINT NOT NULL DEFAULT 30000,
  allowed_asset_id BIGINT NOT NULL DEFAULT 0,
  allowed_dex_app_id BIGINT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  wallet_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_policy_bindings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_address TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  policy_template_id UUID REFERENCES policy_templates(id) ON DELETE SET NULL,
  max_per_trade_microalgos BIGINT,
  daily_cap_microalgos BIGINT,
  daily_executions_cap BIGINT,
  allowed_asset_id BIGINT DEFAULT 0,
  allowed_dex_app_id BIGINT DEFAULT 0,
  expiry_round BIGINT,
  last_bootstrap_tx_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_wallets ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE agent_wallets ADD COLUMN IF NOT EXISTS policy_binding_id UUID REFERENCES agent_policy_bindings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_policy_bindings_wallet ON agent_policy_bindings(wallet_address);
CREATE INDEX IF NOT EXISTS idx_policy_templates_system ON policy_templates(is_system) WHERE is_system = true;

ALTER TABLE policy_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_policy_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "policy_templates_read" ON policy_templates;
CREATE POLICY "policy_templates_read"
  ON policy_templates FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "agent_policy_bindings_all" ON agent_policy_bindings;
CREATE POLICY "agent_policy_bindings_all"
  ON agent_policy_bindings FOR ALL
  USING (true);

-- System default policy templates (Conservative, Standard, Active)
INSERT INTO policy_templates (
  slug, name, description,
  max_per_trade_microalgos, daily_cap_microalgos, daily_executions_cap,
  expiry_round_horizon, allowed_asset_id, allowed_dex_app_id, is_system
) VALUES
  (
    'conservative',
    'Conservative',
    'Low limits for cautious automation. Best for testing or small recurring payments.',
    100000, 500000, 3, 30000, 0, 0, true
  ),
  (
    'standard',
    'Standard',
    'Balanced limits for everyday workflows and scheduled payments.',
    500000, 2000000, 5, 30000, 0, 0, true
  ),
  (
    'active',
    'Active',
    'Higher limits for frequent trading-style automation. Review recipients carefully.',
    1000000, 5000000, 10, 30000, 0, 0, true
  )
ON CONFLICT (slug) DO NOTHING;
