import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SettingsLayout } from '../components/settings/SettingsLayout'
import { AccountSettings } from '../components/settings/AccountSettings'
import { TelegramSettings } from '../components/settings/TelegramSettings'
import { AgentWalletSettings } from '../components/settings/AgentWalletSettings'
import { GuardianSettings } from '../components/settings/GuardianSettings'
import { RiskManagementSettings } from '../components/settings/RiskManagementSettings'
import type { SettingsSectionId } from '../components/settings/types'

const VALID_SECTIONS: SettingsSectionId[] = ['account', 'agents', 'guardian', 'risk', 'telegram']

function parseSection(value: string | null): SettingsSectionId {
  if (value === 'agent-wallets' || value === 'automation') return 'agents'
  if (value && VALID_SECTIONS.includes(value as SettingsSectionId)) {
    return value as SettingsSectionId
  }
  return 'account'
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    parseSection(searchParams.get('section')),
  )

  useEffect(() => {
    const fromUrl = parseSection(searchParams.get('section'))
    setActiveSection(fromUrl)
  }, [searchParams])

  const handleSectionChange = (id: SettingsSectionId) => {
    setActiveSection(id)
    setSearchParams({ section: id }, { replace: true })
  }

  return (
    <SettingsLayout activeSection={activeSection} onSectionChange={handleSectionChange}>
      {activeSection === 'account' && <AccountSettings />}
      {activeSection === 'agents' && <AgentWalletSettings />}
      {activeSection === 'guardian' && <GuardianSettings />}
      {activeSection === 'risk' && <RiskManagementSettings />}
      {activeSection === 'telegram' && <TelegramSettings />}
    </SettingsLayout>
  )
}
