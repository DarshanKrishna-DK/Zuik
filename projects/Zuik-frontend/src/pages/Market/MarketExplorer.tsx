import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import MarketBreadcrumb from './components/MarketBreadcrumb'
import TopMovers from './components/TopMovers'
import TokenSearch from './components/TokenSearch'
import TokenChart from './components/TokenChart'
import TokenStats from './components/TokenStats'
import BuySellPressure from './components/BuySellPressure'
import FearGreed from './components/FearGreed'
import QuickSwapButton from './components/QuickSwapButton'
import { fetchAlgoUsdPrice } from '../../services/transactionSimulator'
import { getTopMovers, getTokenDetails, type MarketToken } from '../../services/vestigeApi'

export default function MarketExplorer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedToken, setSelectedToken] = useState<MarketToken | null>(null)

  const { data: algoPrice } = useQuery({
    queryKey: ['market', 'algo-usd'],
    queryFn: fetchAlgoUsdPrice,
    staleTime: 30_000,
  })

  const { data: movers = [], isLoading: moversLoading } = useQuery({
    queryKey: ['vestige', 'top-movers'],
    queryFn: getTopMovers,
    staleTime: 60_000,
  })

  const assetParam = useMemo(() => {
    const raw = searchParams.get('asset')
    return raw ? Number(raw) : null
  }, [searchParams])

  const activeAssetId = assetParam ?? selectedToken?.id ?? null

  const { data: tokenDetails } = useQuery({
    queryKey: ['vestige', 'asset', activeAssetId],
    queryFn: () => (activeAssetId ? getTokenDetails(activeAssetId) : Promise.resolve(null)),
    enabled: !!activeAssetId && activeAssetId !== 0,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!activeAssetId && movers.length > 0) {
      setSelectedToken(movers[0])
    }
  }, [activeAssetId, movers])

  const handleSelect = useCallback((token: MarketToken) => {
    setSelectedToken(token)
    const next = new URLSearchParams(searchParams)
    next.set('asset', String(token.id))
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const activeToken = tokenDetails ?? selectedToken ?? (assetParam ? {
    id: assetParam,
    name: `ASA #${assetParam}`,
    unitName: `ASA #${assetParam}`,
    priceUsd: null,
    change1h: null,
    change24h: null,
    change7d: null,
    volume24h: null,
    liquidityUsd: null,
    marketCapUsd: null,
    logoUrl: null,
    decimals: null,
  } : null) ?? movers[0] ?? {
    id: 0,
    name: 'Algorand',
    unitName: 'ALGO',
    priceUsd: algoPrice ?? null,
    change1h: null,
    change24h: null,
    change7d: null,
    volume24h: null,
    liquidityUsd: null,
    marketCapUsd: null,
    logoUrl: null,
    decimals: 6,
  }

  return (
    <div className="zuik-market">
      <div className="zuik-dashboard-mesh" aria-hidden />
      <div className="zuik-market-inner">
        <MarketBreadcrumb algoPrice={algoPrice ?? null} selectedToken={activeToken} />
        <div className="market-layout">
          <div className="market-left">
            <TokenSearch onSelect={handleSelect} activeId={activeToken.id} />
            <TokenChart assetId={activeToken.id} symbol={activeToken.unitName || activeToken.name} />
            <TokenStats token={activeToken} />
            <BuySellPressure assetId={activeToken.id} priceUsd={activeToken.priceUsd} decimals={activeToken.decimals} />
          </div>
          <div className="market-right">
            <TopMovers movers={movers} isLoading={moversLoading} activeId={activeToken.id} onSelect={handleSelect} />
            <FearGreed />
            <QuickSwapButton token={activeToken} />
          </div>
        </div>
      </div>
    </div>
  )
}
