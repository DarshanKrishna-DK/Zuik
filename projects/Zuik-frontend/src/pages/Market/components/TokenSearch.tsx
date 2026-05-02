import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchTokens, type MarketToken } from '../../../services/vestigeApi'
import { formatUsd } from '../utils'

interface TokenSearchProps {
  onSelect: (token: MarketToken) => void
  activeId?: number | null
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export default function TokenSearch({ onSelect, activeId }: TokenSearchProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(handle)
  }, [query])

  const { data = [], isFetching } = useQuery({
    queryKey: ['vestige', 'search', debounced],
    queryFn: () => searchTokens(debounced),
    enabled: debounced.length > 1,
    staleTime: 10 * 60_000,
  })

  return (
    <div className="market-card">
      <div className="market-card-title"><SearchIcon /> Token Search</div>
      <div className="market-search-row">
        <SearchIcon />
        <input
          placeholder="Search ASA by name or symbol"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isFetching && <span className="market-muted">Searching...</span>}
      </div>
      {debounced.length > 1 && data.length === 0 && !isFetching && (
        <div className="market-muted">No results found.</div>
      )}
      <div className="market-search-results">
        {data.slice(0, 6).map((token) => (
          <button
            key={token.id}
            className={`market-search-item${activeId === token.id ? ' active' : ''}`}
            onClick={() => onSelect(token)}
          >
            <div>
              <div className="market-search-title">{token.name}</div>
              <div className="market-search-sub">{token.unitName}</div>
            </div>
            <div className="market-search-price">{formatUsd(token.priceUsd)}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
