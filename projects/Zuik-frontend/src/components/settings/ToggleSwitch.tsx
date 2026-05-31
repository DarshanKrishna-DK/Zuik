interface ToggleSwitchProps {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label?: string
  id?: string
  testId?: string
}

export function ToggleSwitch({
  checked,
  disabled = false,
  onChange,
  label,
  id,
  testId,
}: ToggleSwitchProps) {
  return (
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
      <span className="st-switch-track" aria-hidden />
      {label && <span className="st-switch-label">{label}</span>}
    </label>
  )
}
