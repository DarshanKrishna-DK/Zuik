import { useState, useCallback } from 'react'
import type { ConfigField } from '../../lib/blockRegistry'

interface BlockInputsProps {
  fields: ConfigField[]
  values: Record<string, string | number>
  onChange: (fieldId: string, value: string | number) => void
}

/**
 * Prevents keyboard events inside inputs from propagating to React Flow,
 * which would otherwise delete the node on Backspace / Delete.
 */
function stopRfKeys(e: React.KeyboardEvent) {
  e.stopPropagation()
}

export default function BlockInputs({ fields, values, onChange }: BlockInputsProps) {
  const [hoveredOption, setHoveredOption] = useState<string | null>(null)

  const handleChange = useCallback(
    (fieldId: string, fieldType: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const raw = e.target.value
      if (fieldType === 'number') {
        onChange(fieldId, raw === '' ? '' : Number(raw))
      } else {
        onChange(fieldId, raw)
      }
    },
    [onChange],
  )

  return (
    <>
      {fields.map((field) => {
        const currentVal = values[field.id] ?? field.defaultValue ?? ''

        return (
          <div key={field.id} className="zuik-node-field">
            <label>{field.label}</label>

            {field.type === 'select' ? (
              <div style={{ position: 'relative' }}>
                <select
                  value={currentVal}
                  onChange={handleChange(field.id, field.type)}
                  onKeyDown={stopRfKeys}
                  onMouseLeave={() => setHoveredOption(null)}
                >
                  <option value="">- select -</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}
                      onMouseEnter={() => opt.description && setHoveredOption(opt.value)}
                      onMouseLeave={() => setHoveredOption(null)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {hoveredOption && field.options?.find(o => o.value === hoveredOption)?.description && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
                    padding: '6px 8px', background: 'var(--z-bg)', border: '1px solid var(--z-border)',
                    borderRadius: 6, fontSize: '0.6875rem', color: 'var(--z-text-muted)', whiteSpace: 'nowrap', zIndex: 20,
                  }}>
                    {field.options?.find(o => o.value === hoveredOption)?.description}
                  </div>
                )}
              </div>
            ) : field.type === 'textarea' ? (
              <textarea
                rows={2}
                placeholder={field.placeholder}
                value={currentVal}
                onChange={handleChange(field.id, field.type)}
                onKeyDown={stopRfKeys}
                style={{ resize: 'vertical', minHeight: '2.5rem' }}
              />
            ) : field.type === 'slider' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 1}
                  value={currentVal} onChange={handleChange(field.id, 'number')}
                  onKeyDown={stopRfKeys}
                  style={{ flex: 1, accentColor: 'var(--z-accent)' }} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--z-text-muted)', minWidth: 32, textAlign: 'right', fontFamily: 'var(--z-mono)' }}>
                  {currentVal}
                </span>
              </div>
            ) : field.type === 'password' ? (
              <input type="password" placeholder={field.placeholder} value={currentVal} onChange={handleChange(field.id, field.type)} onKeyDown={stopRfKeys} />
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                placeholder={field.placeholder}
                value={currentVal}
                onChange={handleChange(field.id, field.type)}
                onKeyDown={stopRfKeys}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
