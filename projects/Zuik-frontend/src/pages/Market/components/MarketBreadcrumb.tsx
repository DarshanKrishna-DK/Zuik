import type { MarketToken } from '../../../services/vestigeApi'
import { formatUsd } from '../utils'

interface MarketBreadcrumbProps {
  algoPrice: number | null
  selectedToken?: MarketToken | null
}

function TrendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 3 3 4-5" />
    </svg>
  )
}

export default function MarketBreadcrumb({ algoPrice, selectedToken }: MarketBreadcrumbProps) {
  return (
    <div className="market-breadcrumb">
      <div>
        <div className="market-title"><TrendIcon /> Market Explorer</div>
        <div className="market-subtitle">Real-time Algorand token insights and trading signals.</div>
      </div>
      <div className="market-breadcrumb-right">
        <div className="market-pill">
          <span>ALGO/USD</span>
          <strong>{formatUsd(algoPrice)}</strong>
        </div>
        {selectedToken && (
          <div className="market-pill">
            <span>{selectedToken.unitName || selectedToken.name}</span>
            <strong>{formatUsd(selectedToken.priceUsd)}</strong>
          </div>
        )}
      </div>
    </div>
  )
}
