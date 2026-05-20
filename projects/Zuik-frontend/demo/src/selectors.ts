/** Stable selectors for Zuik UI automation (prefer data-testid, fall back to roles/text). */
export const SEL = {
  nav: {
    connectWallet: '[data-testid="nav-connect-wallet"]',
    builder: 'a[href="/builder"]',
    market: 'a[href="/market"]',
    dashboard: 'a[href="/dashboard"]',
    settings: 'a[href="/settings"]',
  },
  wallet: {
    modal: '.z-modal-backdrop',
    close: '[data-test-id="close-wallet-modal"]',
    kmdConnect: '[data-test-id="kmd-connect"]',
    peraConnect: '[data-test-id="pera-connect"]',
    deflyConnect: '[data-test-id="defly-connect"]',
  },
  builder: {
    aiButton: '[data-testid="builder-ai-assistant"]',
    chatInput: '[data-testid="chat-input"]',
    chatSend: '[data-testid="chat-send"]',
    chatPanel: '.zuik-chat-panel',
    templateBtn: 'button:has-text("Templates")',
    runWorkflow: 'button:has-text("Run Workflow")',
    reactFlow: '.react-flow',
    flowNode: '.react-flow__node',
  },
  settings: {
    delegationCard: '[data-testid="settings-delegation"]',
    maxPerTrade: '[data-testid="delegation-max-per-trade"]',
    dailyCap: '[data-testid="delegation-daily-cap"]',
    createDelegation: '[data-testid="delegation-create"]',
  },
  guardian: {
    section: '[data-testid="guardian-settings"]',
    optIn: '[data-testid="guardian-agent-opt-in"]',
    agentAddress: '#agentAddress',
    dailyCap: '#dailyCapAlgo',
    register: '[data-testid="guardian-register-agent"]',
    refreshStatus: '.check-status-btn',
  },
  market: {
    quickSwap: '[data-testid="market-quick-swap"]',
    tradeButton: '[data-testid="market-trade-button"]',
  },
  landing: {
    startBuilding: '[data-testid="landing-start-building"]',
  },
} as const
