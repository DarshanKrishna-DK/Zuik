import { useState, useCallback, type ReactNode } from 'react'
import { IconCopy, IconExternalLink, IconInfo } from './SettingsIcons'

export function SettingsPanelHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <header className="st-panel-header">
      <h2 className="st-panel-title">{title}</h2>
      {subtitle && <p className="st-panel-subtitle">{subtitle}</p>}
    </header>
  )
}

export function HelpCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="st-help-card" role="note">
      <IconInfo />
      <div>
        {title && <strong className="st-help-card-title">{title}</strong>}
        <div className="st-help-card-body">{children}</div>
      </div>
    </div>
  )
}

export function StatusBadge({
  variant = 'neutral',
  children,
}: {
  variant?: 'success' | 'warning' | 'error' | 'neutral' | 'accent'
  children: ReactNode
}) {
  return <span className={`st-badge st-badge--${variant}`}>{children}</span>
}

export function SettingsCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`st-card ${className}`.trim()}>{children}</div>
}

export function SettingsField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="st-field">
      <label className="st-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="st-field-hint">{hint}</span>}
    </div>
  )
}

export function SettingsInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean },
) {
  const { mono, className = '', ...rest } = props
  return (
    <input
      className={`st-input${mono ? ' st-input--mono' : ''} ${className}`.trim()}
      {...rest}
    />
  )
}

export function FeedbackMessage({
  variant,
  children,
}: {
  variant: 'success' | 'error' | 'info'
  children: ReactNode
}) {
  if (!children) return null
  return <div className={`st-feedback st-feedback--${variant}`}>{children}</div>
}

export function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="st-detail-row">
      <span className="st-detail-label">{label}</span>
      <span className={`st-detail-value${mono ? ' st-detail-value--mono' : ''}`}>{value}</span>
    </div>
  )
}

export function AddressDisplay({
  address,
  explorerUrl,
}: {
  address: string
  explorerUrl?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [address])

  const short = `${address.slice(0, 8)}...${address.slice(-8)}`

  return (
    <div className="st-address">
      <code className="st-address-text" title={address}>
        {short}
      </code>
      <div className="st-address-actions">
        <button type="button" className="st-btn-icon" onClick={copy} aria-label="Copy address">
          <IconCopy />
        </button>
        {copied && <span className="st-address-copied">Copied</span>}
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="st-btn-icon st-btn-icon--link"
            aria-label="View on explorer"
          >
            <IconExternalLink />
          </a>
        )}
      </div>
    </div>
  )
}

export function LoadingBlock({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="st-loading" role="status">
      <span className="z-spinner" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function LoadingSpinner() {
  return <span className="z-spinner" aria-hidden />
}

export function PanelSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="st-section">
      <div className="st-section-header">
        <h3 className="st-section-title">{title}</h3>
        {description && <p className="st-section-description">{description}</p>}
      </div>
      <div className="st-section-content">
        {children}
      </div>
    </section>
  )
}

export function PanelRow({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`st-row ${className}`.trim()}>{children}</div>
}

export function InfoBox({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'error' | 'success' | 'neutral'
  children: ReactNode
}) {
  return (
    <div className={`st-info-box st-info-box--${type}`}>
      <IconInfo />
      <div className="st-info-box-content">{children}</div>
    </div>
  )
}
