import { useQuery } from '@tanstack/react-query'
import { getFearGreedIndex } from '../../../services/marketDataService'

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v6l4-4 4 4-4 4 4 4-4 4-4-4v6" />
      <path d="M4 12l4-4 4 4-4 4-4-4z" />
    </svg>
  )
}

export default function FearGreed() {
  const { data, isFetching } = useQuery({
    queryKey: ['market', 'fear-greed'],
    queryFn: getFearGreedIndex,
    staleTime: 60 * 60_000,
  })

  const value = data?.value ?? null
  const classification = data?.classification ?? 'Unavailable'

  return (
    <div className="market-card">
      <div className="market-card-title"><SparkIcon /> Fear & Greed</div>
      {isFetching && <div className="market-muted">Loading sentiment...</div>}
      {!data && !isFetching && (
        <div className="market-muted">Sentiment feed unavailable.</div>
      )}
      {data && (
        <div className="market-fear-greed">
          <div className="market-fear-greed-score">{value}</div>
          <div className="market-fear-greed-label">{classification}</div>
        </div>
      )}
    </div>
  )
}
