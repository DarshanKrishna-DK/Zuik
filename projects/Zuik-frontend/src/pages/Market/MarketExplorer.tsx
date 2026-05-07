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
import { getTopMovers, getTokenDetails, type MarketToken, type MarketTokenId } from '../../services/vestigeApi'
import { getAlgoMarketSummary, getFxRates } from '../../services/marketDataService'

export default function MarketExplorer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedToken, setSelectedToken] = useState<MarketToken | null>(null)
  const [fiat, setFiat] = useState('USD')

  const { data: algoPrice } = useQuery({
    queryKey: ['market', 'algo-usd'],
    queryFn: fetchAlgoUsdPrice,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const { data: algoSummary } = useQuery({
    queryKey: ['market', 'algo-summary'],
    queryFn: getAlgoMarketSummary,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const { data: fxRates } = useQuery({
    queryKey: ['market', 'fx-rates'],
    queryFn: getFxRates,
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  })

  const { data: movers = [], isLoading: moversLoading } = useQuery({
    queryKey: ['vestige', 'top-movers'],
    queryFn: getTopMovers,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const assetParam = useMemo<MarketTokenId | null>(() => {
    const raw = searchParams.get('asset')
    if (!raw) return null
    if (/^\d+$/.test(raw)) return Number(raw)
    return raw
  }, [searchParams])

  const activeAssetId = assetParam ?? selectedToken?.id ?? null

  const { data: tokenDetails } = useQuery({
    queryKey: ['vestige', 'asset', activeAssetId],
    queryFn: () => (activeAssetId ? getTokenDetails(activeAssetId) : Promise.resolve(null)),
    enabled: !!activeAssetId && activeAssetId !== 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
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
    name: typeof assetParam === 'number' ? `ASA #${assetParam}` : assetParam.replace('cg:', '').toUpperCase(),
    unitName: typeof assetParam === 'number' ? `ASA #${assetParam}` : assetParam.replace('cg:', '').toUpperCase(),
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
    priceUsd: algoSummary?.priceUsd ?? algoPrice ?? null,
    change1h: null,
    change24h: algoSummary?.change24h ?? null,
    change7d: null,
    volume24h: algoSummary?.volume24h ?? null,
    liquidityUsd: null,
    marketCapUsd: algoSummary?.marketCapUsd ?? null,
    logoUrl: null,
    decimals: 6,
  }

  const displayToken = useMemo(() => {
    if (activeToken.id !== 0 || !algoSummary) return activeToken
    return {
      ...activeToken,
      priceUsd: algoSummary.priceUsd ?? activeToken.priceUsd,
      change24h: algoSummary.change24h ?? activeToken.change24h,
      volume24h: algoSummary.volume24h ?? activeToken.volume24h,
      marketCapUsd: algoSummary.marketCapUsd ?? activeToken.marketCapUsd,
    }
  }, [activeToken, algoSummary])

  const fiatOptions = useMemo(() => {
    if (!fxRates) return ['USD', 'EUR', 'GBP', 'INR', 'JPY']
    return Object.keys(fxRates)
      .filter((code) => /^[A-Z]{3}$/.test(code))
      .sort()
  }, [fxRates])

  const fiatRate = fiat === 'USD' ? 1 : (fxRates?.[fiat] ?? null)

  useEffect(() => {
    if (fiatOptions.length > 0 && !fiatOptions.includes(fiat)) {
      setFiat('USD')
    }
  }, [fiat, fiatOptions])

  return (
    <div className="zuik-market">
      <div className="zuik-dashboard-mesh" aria-hidden />
      <div className="zuik-market-inner">
        <MarketBreadcrumb
          algoPrice={algoSummary?.priceUsd ?? algoPrice ?? null}
          selectedToken={displayToken}
          fiatCurrency={fiat}
          fiatRate={fiatRate}
          fiatOptions={fiatOptions}
          onFiatChange={setFiat}
        />
        <div className="market-layout">
          <div className="market-left">
            <TokenSearch onSelect={handleSelect} activeId={displayToken.id} />
            <TokenChart assetId={displayToken.id} symbol={displayToken.unitName || displayToken.name} />
            <TokenStats token={displayToken} />
            <BuySellPressure assetId={displayToken.id} priceUsd={displayToken.priceUsd} decimals={displayToken.decimals} />
          </div>
          <div className="market-right">
            <TopMovers movers={movers} isLoading={moversLoading} activeId={displayToken.id} onSelect={handleSelect} />
            <FearGreed />
            <QuickSwapButton token={displayToken} />
          </div>
        </div>
      </div>
    </div>
  )
}
