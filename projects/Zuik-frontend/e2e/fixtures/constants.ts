/** TestNet MVP constants - keep in sync with docs/testing/README.md */
export const GUARDIAN_APP_ID = 764398655

export const TEST_RECIPIENT =
  'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'

/** Minimal policy for low-ALGO manual + agent runs */
export const POLICY_MAX_PER_TRADE_ALGO = 0.1
export const POLICY_DAILY_CAP_ALGO = 0.2
export const POLICY_EXECUTIONS = 3
export const AGENT_FUND_ALGO = 0.15
export const HAPPY_PATH_PAYMENT_ALGO = 0.05
export const BLOCKED_PAYMENT_ALGO = 0.15

export const DEFAULT_BASE_URL = process.env.ZUIK_BASE_URL ?? 'http://localhost:5173'
