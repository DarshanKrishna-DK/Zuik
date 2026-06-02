import { useState } from 'react'
import { ShieldAlert, Gauge } from 'lucide-react'
import {
  DEFAULT_MAX_TOKEN_RISK,
  getMaxTokenRiskScore,
  setMaxTokenRiskScore,
} from '../../services/tokenRiskPolicy'
import { riskBandLabel } from '../../services/tokenRisk'
import {
  SettingsPanelHeader,
  HelpCard,
  SettingsCard,
  SettingsField,
  StatusBadge,
} from './SettingsPrimitives'
import './RiskManagementSettings.css'

const RISK_BANDS = [
  { range: '0-25', band: 'low' as const, label: 'Low', desc: 'Established or blue-chip style assets.' },
  { range: '26-50', band: 'moderate' as const, label: 'Moderate', desc: 'Some concentration or liquidity concerns.' },
  { range: '51-75', band: 'elevated' as const, label: 'Elevated', desc: 'Higher volatility; workflows show warnings.' },
  { range: '76-100', band: 'extreme' as const, label: 'Extreme', desc: 'Blocked by default; raise limit only if intentional.' },
]

export function RiskManagementSettings() {
  const [maxTokenRisk, setMaxTokenRisk] = useState(() => getMaxTokenRiskScore())

  const handleChange = (value: number) => {
    setMaxTokenRisk(value)
    setMaxTokenRiskScore(value)
  }

  const handleReset = () => {
    handleChange(DEFAULT_MAX_TOKEN_RISK)
  }

  return (
    <section className="st-section st-section--wide risk-settings" data-testid="risk-settings">
      <SettingsPanelHeader
        title="Risk management"
        subtitle="Control which ASAs workflows and Guardian policies may use based on universal token risk scores."
      />

      <HelpCard title="How risk scores work">
        Zuik scores each ASA from 0 (safest) to 100 (riskiest) using liquidity, holder concentration, and
        metadata signals. Workflows reject any token above your limit before execution. Guardian ASA
        registration uses the same threshold.
      </HelpCard>

      <div className="risk-settings__hero">
        <div className="risk-settings__gauge">
          <Gauge size={28} aria-hidden />
          <div>
            <span className="risk-settings__gauge-label">Your max ASA risk score</span>
            <span className="risk-settings__gauge-value">{maxTokenRisk}</span>
          </div>
        </div>
        <StatusBadge variant={maxTokenRisk <= 50 ? 'success' : maxTokenRisk <= 75 ? 'warning' : 'error'}>
          {maxTokenRisk <= DEFAULT_MAX_TOKEN_RISK ? 'Recommended default' : 'Permissive'}
        </StatusBadge>
      </div>

      <SettingsCard>
        <h3 className="st-card-title">Risk tolerance slider</h3>
        <p className="risk-settings__hint">
          Default {DEFAULT_MAX_TOKEN_RISK} blocks extreme-risk meme coins while allowing moderate assets.
          Lower for stricter safety; raise only when you accept higher ASA exposure.
        </p>
        <SettingsField label={`Maximum allowed score: ${maxTokenRisk}`} htmlFor="maxTokenRisk">
          <input
            id="maxTokenRisk"
            type="range"
            min={0}
            max={100}
            step={1}
            value={maxTokenRisk}
            onChange={(e) => handleChange(Number(e.target.value))}
            className="risk-settings__slider"
            data-testid="risk-slider"
          />
          <div className="risk-settings__scale" aria-hidden>
            <span>0 Strict</span>
            <span>50 Balanced</span>
            <span>100 Permissive</span>
          </div>
        </SettingsField>
        <div className="risk-settings__actions">
          <button type="button" className="z-btn z-btn-ghost z-btn-sm" onClick={handleReset}>
            Reset to default ({DEFAULT_MAX_TOKEN_RISK})
          </button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="st-card-head">
          <h3 className="st-card-title">Risk bands reference</h3>
          <ShieldAlert size={18} className="risk-settings__icon-muted" aria-hidden />
        </div>
        <ul className="risk-settings__bands">
          {RISK_BANDS.map((b) => (
            <li
              key={b.band}
              className={`risk-settings__band${maxTokenRisk >= parseInt(b.range.split('-')[0]!, 10) ? '' : ' risk-settings__band--dim'}`}
            >
              <div className="risk-settings__band-head">
                <span className="risk-settings__band-range">{b.range}</span>
                <StatusBadge variant={b.band === 'low' ? 'success' : b.band === 'extreme' ? 'error' : 'warning'}>
                  {riskBandLabel(b.band)}
                </StatusBadge>
              </div>
              <p className="risk-settings__band-desc">{b.desc}</p>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </section>
  )
}
