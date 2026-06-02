export type SettingsSectionId = 'account' | 'agents' | 'guardian' | 'risk' | 'telegram'

export interface SettingsNavItem {
  id: SettingsSectionId
  label: string
  description: string
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    id: 'account',
    label: 'Account',
    description: 'Wallet and network',
  },
  {
    id: 'agents',
    label: 'Agent wallets',
    description: 'Create, fund, and manage',
  },
  {
    id: 'guardian',
    label: 'Guardian',
    description: 'On-chain spending limits',
  },
  {
    id: 'risk',
    label: 'Risk management',
    description: 'Token safety thresholds',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Bot notifications',
  },
]
