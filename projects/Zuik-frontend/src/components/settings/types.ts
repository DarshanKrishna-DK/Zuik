export type SettingsSectionId = 'account' | 'agents' | 'risk' | 'telegram'

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
    label: 'Agent Management',
    description: 'Wallets, policies, and health',
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
