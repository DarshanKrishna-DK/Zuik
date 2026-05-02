import type { MarketToken } from '../../../services/vestigeApi'
import { formatPercent, formatUsd } from '../utils'

interface TopMoversProps {
  movers: MarketToken[]
  isLoading: boolean
  activeId?: number | null
  onSelect: (token: MarketToken) => void
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 1 10 18a2 2 0 0 0 4 0c0-1.5-.5-2.5-1.5-3.5C11.5 13.5 11 12.5 11 11c0-2 1-3.5 2-5 1.5 1 3 3 3 6a6 6 0 0 1-12 0c0-2 1-4 3-5-.5 2-.5 3.5 1 7.5Z" />
    </svg>
  )
}

export default function TopMovers({ movers, isLoading, activeId, onSelect }: TopMoversProps) {
  return (
    <div className="market-card">
      <div className="market-card-title"><FlameIcon /> Top Movers</div>
      {isLoading && <div className="market-muted">Loading movers...</div>}
      {!isLoading && movers.length === 0 && (
        <div className="market-muted">No movers available yet. Try again shortly.</div>
      )}
      <div className="market-movers-list">
        {movers.slice(0, 8).map((token) => {
          const change = token.change24h ?? token.change1h ?? 0
          const isActive = activeId === token.id
          return (
            <button
              key={token.id}
              className={`market-mover-row${isActive ? ' active' : ''}`}
              onClick={() => onSelect(token)}
            >
              <div className="market-mover-main">
                <span className="market-mover-symbol">{token.unitName || token.name}</span>
                <span className="market-mover-name">{token.name}</span>
              </div>
              <div className="market-mover-meta">
                <span className={`market-mover-change ${change >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(change)}
                </span>
                <span className="market-mover-price">{formatUsd(token.priceUsd)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
