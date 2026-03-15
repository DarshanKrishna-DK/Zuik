import { useState } from 'react'
import type { ConfigField } from '../../lib/blockRegistry'

interface BlockInputsProps {
  fields: ConfigField[]
  values: Record<string, string | number>
  onChange: (fieldId: string, value: string | number) => void
}

export default function BlockInputs({ fields, values, onChange }: BlockInputsProps) {
  const [hoveredOption, setHoveredOption] = useState<string | null>(null)

  return (
    <>
      {fields.map((field) => {
        const currentVal = values[field.id] ?? field.defaultValue ?? ''

        return (
          <div key={field.id} className="zuik-node-field">
            <div className="zuik-node-label">{field.label}</div>

            {field.type === 'select' ? (
              <div style={{ position: 'relative' }}>
                <select
                  className="zuik-node-select"
                  value={currentVal}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  onMouseLeave={() => setHoveredOption(null)}
                >
                  <option value="">— select —</option>
                  {field.options?.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      onMouseEnter={() => opt.description && setHoveredOption(opt.value)}
                      onMouseLeave={() => setHoveredOption(null)}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
                {hoveredOption && field.options?.find(o => o.value === hoveredOption)?.description && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    marginBottom: 4,
                    padding: '6px 8px',
                    background: 'var(--zuik-bg)',
                    border: '1px solid var(--zuik-border)',
                    borderRadius: 6,
                    fontSize: '0.6875rem',
                    color: 'var(--zuik-text-muted)',
                    whiteSpace: 'nowrap',
                    zIndex: 20,
                  }}>
                    {field.options?.find(o => o.value === hoveredOption)?.description}
                  </div>
                )}
              </div>
            ) : field.type === 'textarea' ? (
              <textarea
                className="zuik-node-input"
                rows={2}
                placeholder={field.placeholder}
                value={currentVal}
                onChange={(e) => onChange(field.id, e.target.value)}
                style={{ resize: 'vertical', minHeight: '2.5rem' }}
              />
            ) : field.type === 'slider' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range"
                  min={field.min ?? 0}
                  max={field.max ?? 100}
                  step={field.step ?? 1}
                  value={currentVal}
                  onChange={(e) => onChange(field.id, Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--zuik-orange)' }}
                />
                <span style={{
                  fontSize: '0.6875rem',
                  color: 'var(--zuik-text-muted)',
                  minWidth: 32,
                  textAlign: 'right',
                }}>
                  {currentVal}
                </span>
              </div>
            ) : field.type === 'password' ? (
              <input
                className="zuik-node-input"
                type="password"
                placeholder={field.placeholder}
                value={currentVal}
                onChange={(e) => onChange(field.id, e.target.value)}
              />
            ) : (
              <input
                className="zuik-node-input"
                type={field.type === 'number' ? 'number' : 'text'}
                placeholder={field.placeholder}
                value={currentVal}
                onChange={(e) => {
                  const v = field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
                  onChange(field.id, v)
                }}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
