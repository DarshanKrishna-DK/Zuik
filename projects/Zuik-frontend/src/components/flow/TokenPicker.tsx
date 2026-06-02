import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatTokenDisplay, resolveAsset, searchTokens, type TokenSearchHit } from '../../services/tokenResolver'
import { computeRiskScore, riskBandLabel, type RiskBand, type TokenRiskResult } from '../../services/tokenRisk'

interface TokenPickerProps {
  label: string
  value: string | number
  onChange: (value: string | number) => void
}

function parseAssetId(value: string | number): number | null {
  if (value === '' || value === undefined || value === null) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function bandClass(band: RiskBand): string {
  switch (band) {
    case 'low': return 'zuik-token-risk--low'
    case 'moderate': return 'zuik-token-risk--moderate'
    case 'elevated': return 'zuik-token-risk--elevated'
    case 'extreme': return 'zuik-token-risk--extreme'
  }
}

export default function TokenPicker({ label, value, onChange }: TokenPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<TokenSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [risk, setRisk] = useState<TokenRiskResult | null>(null)
  const [riskLoading, setRiskLoading] = useState(false)
  const [extremeConfirmed, setExtremeConfirmed] = useState(false)
  const [pendingExtremeId, setPendingExtremeId] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selectedId = useMemo(() => parseAssetId(value), [value])

  useEffect(() => {
    if (selectedId == null) {
      setResolvedLabel(null)
      setRisk(null)
      return
    }

    let cancelled = false
    setRiskLoading(true)

    Promise.all([
      resolveAsset(selectedId).then((t) => formatTokenDisplay(t)).catch(() => `Token (ID ${selectedId})`),
      computeRiskScore(selectedId),
    ])
      .then(([display, riskResult]) => {
        if (cancelled) return
        setResolvedLabel(display)
        setRisk(riskResult)
        if (riskResult.band !== 'extreme') {
          setExtremeConfirmed(true)
          setPendingExtremeId(null)
        } else if (pendingExtremeId !== selectedId) {
          setExtremeConfirmed(false)
        }
      })
      .finally(() => {
        if (!cancelled) setRiskLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedId, pendingExtremeId])

  useEffect(() => {
    const trimmed = query.trim()
    if (!open || trimmed.length < 1) {
      setResults([])
      return
    }

    const timer = window.setTimeout(() => {
      setSearching(true)
      searchTokens(trimmed)
        .then((hits) => setResults(hits.slice(0, 12)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 280)

    return () => window.clearTimeout(timer)
  }, [query, open])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleSelect = useCallback(async (hit: TokenSearchHit) => {
    const riskResult = await computeRiskScore(hit.id)
    if (riskResult.band === 'extreme') {
      setPendingExtremeId(hit.id)
      setExtremeConfirmed(false)
      onChange(hit.id)
      setQuery('')
      setOpen(false)
      return
    }
    setExtremeConfirmed(true)
    setPendingExtremeId(null)
    onChange(hit.id)
    setQuery('')
    setOpen(false)
  }, [onChange])

  const confirmExtreme = useCallback(() => {
    setExtremeConfirmed(true)
  }, [])

  const showExtremeGate = selectedId != null && risk?.band === 'extreme' && !extremeConfirmed

  return (
    <div className="zuik-token-picker" ref={wrapRef}>
      <label>{label}</label>

      {selectedId != null && resolvedLabel && (
        <div className="zuik-token-picker-selected">
          <span className="zuik-token-picker-name">{resolvedLabel}</span>
          <span className="zuik-token-picker-id">ID {selectedId}</span>
          {riskLoading ? (
            <span className="zuik-token-risk zuik-token-risk--unknown">Checking risk...</span>
          ) : risk ? (
            <span
              className={`zuik-token-risk ${bandClass(risk.band)}`}
              title={risk.reasons.join('\n')}
            >
              {risk.score} - {riskBandLabel(risk.band)}
            </span>
          ) : (
            <span className="zuik-token-risk zuik-token-risk--unknown">Risk unknown</span>
          )}
        </div>
      )}

      {showExtremeGate && (
        <div className="zuik-token-picker-warning" role="alert">
          <strong>High risk token.</strong>
          <p>
            This asset scored {risk?.score}/100 (extreme). Centralization, thin liquidity, or very new
            issuance may mean total loss. Only continue if you understand the risk.
          </p>
          <button type="button" className="zuik-token-picker-confirm" onClick={confirmExtreme}>
            I understand, use this token
          </button>
        </div>
      )}

      <input
        type="text"
        className="zuik-token-picker-input"
        placeholder="Search name or paste ASA ID"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.stopPropagation()}
      />

      {open && (query.trim() || results.length > 0) && (
        <ul className="zuik-token-picker-dropdown" role="listbox">
          {searching && <li className="zuik-token-picker-hint">Searching...</li>}
          {!searching && results.length === 0 && query.trim() && (
            <li className="zuik-token-picker-hint">No tokens found. Try an ASA ID number.</li>
          )}
          {results.map((hit) => (
            <TokenResultRow key={hit.id} hit={hit} onSelect={() => handleSelect(hit)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TokenResultRow({ hit, onSelect }: { hit: TokenSearchHit; onSelect: () => void }) {
  const [risk, setRisk] = useState<TokenRiskResult | null>(null)

  useEffect(() => {
    let cancelled = false
    computeRiskScore(hit.id)
      .then((r) => { if (!cancelled) setRisk(r) })
      .catch(() => { if (!cancelled) setRisk(null) })
    return () => { cancelled = true }
  }, [hit.id])

  return (
    <li>
      <button type="button" className="zuik-token-picker-option" onClick={onSelect}>
        <span className="zuik-token-picker-option-label">
          <span className="zuik-token-picker-option-name">{hit.label}</span>
          <span className="zuik-token-picker-option-id">ID {hit.id}</span>
        </span>
        {risk ? (
          <span className={`zuik-token-risk ${bandClass(risk.band)}`}>{risk.score}</span>
        ) : (
          <span className="zuik-token-risk zuik-token-risk--unknown">?</span>
        )}
      </button>
    </li>
  )
}
