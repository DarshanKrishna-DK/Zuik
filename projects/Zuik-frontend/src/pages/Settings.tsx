import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SettingsLayout } from '../components/settings/SettingsLayout'
import { AccountSettings } from '../components/settings/AccountSettings'
import { TelegramSettings } from '../components/settings/TelegramSettings'
import { AgentManagement } from '../components/settings/AgentManagement'
import { RiskManagementSettings } from '../components/settings/RiskManagementSettings'
import type { SettingsSectionId } from '../components/settings/types'
import { useVoicePageContext } from '../components/voice'

const VALID_SECTIONS: SettingsSectionId[] = ['account', 'agents', 'risk', 'telegram']

function parseSection(value: string | null): SettingsSectionId {
  if (value === 'agent-wallets' || value === 'automation' || value === 'guardian') return 'agents'
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

  const voicePageContext = useMemo(
    () => ({
      summary: `Settings, ${activeSection} section`,
      data: { settingsSection: activeSection },
    }),
    [activeSection],
  )

  useVoicePageContext('/settings', voicePageContext)

  return (
    <SettingsLayout activeSection={activeSection} onSectionChange={handleSectionChange}>
      {activeSection === 'account' && <AccountSettings />}
      {activeSection === 'agents' && <AgentManagement />}
      {activeSection === 'risk' && <RiskManagementSettings />}
      {activeSection === 'telegram' && <TelegramSettings />}
    </SettingsLayout>
  )
}
