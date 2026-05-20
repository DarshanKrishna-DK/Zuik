import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Customized,
} from 'recharts'
import { getTokenOHLCV, type OhlcvPoint, type MarketTokenId } from '../../../services/vestigeApi'
import { formatUsd } from '../utils'

const CHART_INTERVALS: Record<string, { interval: string; limit: number; format: Intl.DateTimeFormatOptions }> = {
  '1H': { interval: '5m', limit: 12, format: { hour: '2-digit', minute: '2-digit' } },
  '4H': { interval: '15m', limit: 16, format: { hour: '2-digit', minute: '2-digit' } },
  '1D': { interval: '1h', limit: 24, format: { hour: '2-digit', minute: '2-digit' } },
  '7D': { interval: '4h', limit: 42, format: { month: 'short', day: 'numeric' } },
  '30D': { interval: '1d', limit: 30, format: { month: 'short', day: 'numeric' } },
}

interface ChartPoint {
  /** Unix ms for Recharts time scale (avoids duplicate category labels breaking candles). */
  time: number
  label: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface TokenChartProps {
  assetId: MarketTokenId
  symbol: string
}

function formatPoint(point: OhlcvPoint, format: Intl.DateTimeFormatOptions): ChartPoint {
  const label = new Intl.DateTimeFormat('en-US', format).format(new Date(point.timestamp))
  return {
    time: point.timestamp,
    label,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume,
  }
}

function CandlesLayer(props: { data?: ChartPoint[]; xAxisMap?: Record<string, any>; yAxisMap?: Record<string, any> }) {
  const { data, xAxisMap, yAxisMap } = props
  if (!data || !xAxisMap || !yAxisMap) return null
  const xAxis = xAxisMap.main ?? Object.values(xAxisMap)[0]
  const yAxis = yAxisMap.price ?? Object.values(yAxisMap)[0]
  if (!xAxis || !yAxis) return null

  const scaleX = xAxis.scale
  const scaleY = yAxis.scale
  const bandwidth = typeof xAxis.bandwidth === 'function' ? xAxis.bandwidth() : 0
  const candleWidth = bandwidth > 0 ? Math.max(4, bandwidth * 0.6) : 8

  return (
    <g>
      {data.map((entry, idx) => {
        const rawX = scaleX ? scaleX(entry.time) : 0
        const x = rawX + (Number.isFinite(bandwidth) && bandwidth > 0 ? bandwidth / 2 : 0)
        const openY = scaleY ? scaleY(entry.open) : 0
        const closeY = scaleY ? scaleY(entry.close) : 0
        const highY = scaleY ? scaleY(entry.high) : 0
        const lowY = scaleY ? scaleY(entry.low) : 0
        const isGreen = entry.close >= entry.open
        const color = isGreen ? '#34D399' : '#F87171'
        const bodyTop = Math.min(openY, closeY)
        const bodyHeight = Math.max(Math.abs(closeY - openY), 1)

        return (
          <g key={`${entry.time}_${idx}`}>
            <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1} />
            <rect
              x={x - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
              rx={1.5}
            />
          </g>
        )
      })}
    </g>
  )
}

function CandleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  return (
    <div className="market-tooltip">
      <div className="market-tooltip-title">{point.label}</div>
      <div className="market-tooltip-row">Open: {formatUsd(point.open)}</div>
      <div className="market-tooltip-row">High: {formatUsd(point.high)}</div>
      <div className="market-tooltip-row">Low: {formatUsd(point.low)}</div>
      <div className="market-tooltip-row">Close: {formatUsd(point.close)}</div>
    </div>
  )
}

export default function TokenChart({ assetId, symbol }: TokenChartProps) {
  const [interval, setInterval] = useState('1D')
  const config = CHART_INTERVALS[interval]

  const { data = [], isFetching, isError, refetch } = useQuery({
    queryKey: ['vestige', 'ohlcv', assetId, interval],
    queryFn: () => getTokenOHLCV(assetId, config.interval, config.limit),
    staleTime: 5 * 60_000,
    refetchInterval: 60_000,
    retry: 2,
    enabled: assetId !== undefined && assetId !== null,
  })

  const chartData = useMemo(() => data.map((point) => formatPoint(point, config.format)), [data, config.format])

  return (
    <div className="market-card market-chart-card">
      <div className="market-card-title">
        <span>{symbol} Candles</span>
        <div className="market-intervals">
          {Object.keys(CHART_INTERVALS).map((key) => (
            <button
              key={key}
              onClick={() => setInterval(key)}
              className={`market-interval-btn${interval === key ? ' active' : ''}`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
      {isFetching && chartData.length === 0 && (
        <div className="market-muted">Loading price history...</div>
      )}
      {isError && (
        <div className="market-muted">
          Could not load chart data.{' '}
          <button type="button" className="market-retry-btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}
      {!isFetching && !isError && chartData.length === 0 && (
        <div className="market-muted">Price history is not available for this token yet.</div>
      )}
      <div className="market-chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}>
            <XAxis
              xAxisId="main"
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(ts) =>
                new Intl.DateTimeFormat('en-US', config.format).format(new Date(Number(ts)))
              }
              tick={{ fill: '#6B7280', fontSize: 11 }}
              minTickGap={24}
            />
            <YAxis yAxisId="price" tick={{ fill: '#6B7280', fontSize: 11 }} domain={['auto', 'auto']} />
            <YAxis yAxisId="volume" orientation="right" hide />
            <Tooltip content={<CandleTooltip />} />
            <Bar yAxisId="volume" dataKey="volume" fill="rgba(0,229,255,0.2)" barSize={6} />
            <Customized component={CandlesLayer} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
