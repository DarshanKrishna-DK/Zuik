import { useQuery } from '@tanstack/react-query'
import type { MarketToken } from '../../../services/vestigeApi'
import { getHolderCount } from '../../../services/marketDataService'
import { formatPercent, formatUsd, formatUsdCompact, formatTokenLabel } from '../utils'

interface TokenStatsProps {
  token: MarketToken
}

function StatsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <rect x="7" y="10" width="3" height="6" />
      <rect x="12" y="6" width="3" height="10" />
      <rect x="17" y="12" width="3" height="4" />
    </svg>
  )
}

export default function TokenStats({ token }: TokenStatsProps) {
  const { data: holderCount } = useQuery({
    queryKey: ['indexer', 'holders', token.id],
    queryFn: () => getHolderCount(typeof token.id === 'number' ? token.id : 0),
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: typeof token.id === 'number' && token.id > 0,
  })

  return (
    <div className="market-card">
      <div className="market-card-title"><StatsIcon /> Token Stats</div>
      <div className="market-stat-grid">
        <div className="market-stat">
          <span className="market-stat-label">Asset</span>
          <span className="market-stat-value">{formatTokenLabel(token.name, token.unitName)}</span>
        </div>
        <div className="market-stat">
          <span className="market-stat-label">Price</span>
          <span className="market-stat-value">{formatUsd(token.priceUsd)}</span>
        </div>
        <div className="market-stat">
          <span className="market-stat-label">24h Change</span>
          <span className={`market-stat-value ${token.change24h && token.change24h < 0 ? 'negative' : 'positive'}`}>
            {formatPercent(token.change24h)}
          </span>
        </div>
        <div className="market-stat">
          <span className="market-stat-label">Volume (24h)</span>
          <span className="market-stat-value">{formatUsdCompact(token.volume24h)}</span>
        </div>
        <div className="market-stat">
          <span className="market-stat-label">Liquidity</span>
          <span className="market-stat-value">{formatUsdCompact(token.liquidityUsd)}</span>
        </div>
        <div className="market-stat">
          <span className="market-stat-label">Market Cap</span>
          <span className="market-stat-value">{formatUsdCompact(token.marketCapUsd)}</span>
        </div>
        <div className="market-stat">
          <span className="market-stat-label">Holders</span>
          <span className="market-stat-value">{holderCount ?? '--'}</span>
        </div>
      </div>
    </div>
  )
}
