export function formatUsd(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  if (Math.abs(value) < 0.01) return '< $0.01'
  const decimals = value < 1 ? 4 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatCompact(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatUsdCompact(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatFiat(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value)
}

export function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatTokenLabel(name?: string, unitName?: string): string {
  if (unitName && name) return `${name} (${unitName})`
  return unitName || name || '--'
}
