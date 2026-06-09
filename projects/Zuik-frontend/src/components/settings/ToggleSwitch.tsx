interface ToggleSwitchProps {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label?: string
  id?: string
  testId?: string
  showLabels?: boolean
  onLabel?: string
  offLabel?: string
}

export function ToggleSwitch({
  checked,
  disabled = false,
  onChange,
  label,
  id,
  testId,
  showLabels = false,
  onLabel = "ON",
  offLabel = "OFF",
}: ToggleSwitchProps) {
  return (
    <div className="st-switch-container">
      {showLabels && (
        <span className={`st-switch-state-label ${!checked ? 'st-switch-state-active' : ''}`}>
          {offLabel}
        </span>
      )}
      <label className="st-switch" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="st-switch-input"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={testId}
        />
        <span className="st-switch-track" aria-hidden>
          <span className="st-switch-thumb" />
        </span>
        {label && <span className="st-switch-label">{label}</span>}
      </label>
      {showLabels && (
        <span className={`st-switch-state-label ${checked ? 'st-switch-state-active' : ''}`}>
          {onLabel}
        </span>
      )}
    </div>
  )
}
