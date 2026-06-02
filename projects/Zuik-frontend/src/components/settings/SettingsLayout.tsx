import { useState, useCallback, type ReactNode } from 'react'
import { SETTINGS_NAV, type SettingsSectionId } from './types'
import { navIconFor } from './SettingsIcons'
import './Settings.css'

interface SettingsLayoutProps {
  activeSection: SettingsSectionId
  onSectionChange: (id: SettingsSectionId) => void
  children: ReactNode
}

export function SettingsLayout({ activeSection, onSectionChange, children }: SettingsLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const selectSection = useCallback(
    (id: SettingsSectionId) => {
      onSectionChange(id)
      setMobileNavOpen(false)
    },
    [onSectionChange],
  )

  const activeItem = SETTINGS_NAV.find((n) => n.id === activeSection)

  return (
    <div className="zuik-settings">
      <div className="st-shell">
        <aside className={`st-sidebar${mobileNavOpen ? ' st-sidebar--open' : ''}`}>
          <div className="st-sidebar-header">
            <h1 className="st-page-title">Settings</h1>
            <p className="st-page-desc">Wallet, agents, Guardian limits, risk, and alerts.</p>
          </div>
          <nav className="st-nav" aria-label="Settings sections">
            {SETTINGS_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`st-nav-item${activeSection === item.id ? ' st-nav-item--active' : ''}`}
                onClick={() => selectSection(item.id)}
                aria-current={activeSection === item.id ? 'page' : undefined}
                data-testid={`settings-nav-${item.id}`}
              >
                <span className="st-nav-icon">{navIconFor(item.id)}</span>
                <span className="st-nav-text">
                  <span className="st-nav-label">{item.label}</span>
                  <span className="st-nav-desc">{item.description}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="st-main">
          <div className="st-mobile-bar">
            <button
              type="button"
              className="st-mobile-toggle"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-expanded={mobileNavOpen}
            >
              {activeItem?.label ?? 'Settings'}
            </button>
          </div>
          <div className="st-panel">{children}</div>
        </main>
      </div>
    </div>
  )
}


