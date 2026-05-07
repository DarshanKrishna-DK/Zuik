import { useNavigate } from 'react-router-dom'
import type { MarketToken } from '../../../services/vestigeApi'

interface QuickSwapButtonProps {
  token: MarketToken
}

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7h11l-3-3" />
      <path d="M7 7l3 3" />
      <path d="M17 17H6l3 3" />
      <path d="M17 17l-3-3" />
    </svg>
  )
}

export default function QuickSwapButton({ token }: QuickSwapButtonProps) {
  const navigate = useNavigate()

  const fromAsset = token.unitName || token.name
  const toAsset = fromAsset.toUpperCase() === 'ALGO' ? 'USDC' : 'ALGO'
  const prefillIntent = `Swap 50 ${fromAsset} to ${toAsset}`
  const algorandOnly = typeof token.id !== 'number'

  return (
    <div className="market-card market-quick-swap">
      <div className="market-card-title"><SwapIcon /> Quick Swap</div>
      <p className="market-muted">
        {algorandOnly
          ? 'Swaps are available for Algorand assets only.'
          : 'Send this token directly to the builder with a prefilled swap intent.'}
      </p>
      <button
        className="z-btn z-btn-primary z-btn-sm"
        onClick={() => navigate('/builder', { state: { prefillIntent, fromAssetId: token.id } })}
        disabled={algorandOnly}
      >
        Trade {token.unitName || token.name}
      </button>
    </div>
  )
}
