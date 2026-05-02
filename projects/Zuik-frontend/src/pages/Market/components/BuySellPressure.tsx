import { useQuery } from '@tanstack/react-query'
import { getBuySellPressure } from '../../../services/marketDataService'
import { formatUsdCompact } from '../utils'

interface BuySellPressureProps {
  assetId: number
  priceUsd: number | null
  decimals?: number | null
}

function GaugeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 1 18 0" />
      <path d="M12 12 8 8" />
      <path d="M7 20h10" />
    </svg>
  )
}

export default function BuySellPressure({ assetId, priceUsd, decimals }: BuySellPressureProps) {
  const { data, isFetching } = useQuery({
    queryKey: ['indexer', 'pressure', assetId],
    queryFn: () => getBuySellPressure(assetId, priceUsd, decimals ?? 6, 60),
    staleTime: 60_000,
    enabled: assetId !== undefined && assetId !== null,
  })

  const pressure = data?.pressure ?? 0.5
  const buyPct = Math.round(pressure * 100)
  const sellPct = 100 - buyPct

  return (
    <div className="market-card">
      <div className="market-card-title"><GaugeIcon /> Buy/Sell Pressure</div>
      {isFetching && <div className="market-muted">Analyzing swaps...</div>}
      {!data && !isFetching && (
        <div className="market-muted">Indexer not configured or no swaps detected yet.</div>
      )}
      {data && (
        <>
          <div className="market-pressure-bar">
            <div className="market-pressure-buy" style={{ width: `${buyPct}%` }}>
              Buy {buyPct}%
            </div>
            <div className="market-pressure-sell" style={{ width: `${sellPct}%` }}>
              Sell {sellPct}%
            </div>
          </div>
          <div className="market-pressure-metrics">
            <div>
              <span>Buy Volume</span>
              <strong>{formatUsdCompact(data.buyVolumeUsd)}</strong>
            </div>
            <div>
              <span>Sell Volume</span>
              <strong>{formatUsdCompact(data.sellVolumeUsd)}</strong>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
