export type SettingsSectionId = 'account' | 'automation' | 'telegram' | 'guardian'

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
    id: 'automation',
    label: 'Automation',
    description: 'Spending permissions',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Bot notifications',
  },
  {
    id: 'guardian',
    label: 'Guardian',
    description: 'On-chain protection',
  },
]
