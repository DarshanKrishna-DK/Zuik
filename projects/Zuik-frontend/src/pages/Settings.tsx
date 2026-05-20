import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SettingsLayout } from '../components/settings/SettingsLayout'
import { AccountSettings } from '../components/settings/AccountSettings'
import { AutomationSettings } from '../components/settings/AutomationSettings'
import { TelegramSettings } from '../components/settings/TelegramSettings'
import { GuardianSettings } from '../components/settings/GuardianSettings'
import type { SettingsSectionId } from '../components/settings/types'

const VALID_SECTIONS: SettingsSectionId[] = ['account', 'automation', 'telegram', 'guardian']

function parseSection(value: string | null): SettingsSectionId {
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
      {activeSection === 'automation' && <AutomationSettings />}
      {activeSection === 'telegram' && <TelegramSettings />}
      {activeSection === 'guardian' && <GuardianSettings />}
    </SettingsLayout>
  )
}
