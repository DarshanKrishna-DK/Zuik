import { useWallet } from '@txnlab/use-wallet-react'
import { X } from 'lucide-react'
import { useSnackbar } from 'notistack'
import { useState } from 'react'
import { blockExecutors, getActionBlocksInOrder } from '../../services/blockExecutors'
import { getAlgorandClient } from '../../services/algorand'
import { getBlockById } from '../../lib/blockRegistry'
import type { Node } from '@xyflow/react'
import type { Edge } from '@xyflow/react'

const PERA_EXPLORER_TESTNET = 'https://explorer.perawallet.app/tx'

function formatConfigSummary(blockId: string, config: Record<string, string | number | undefined>): string {
  const def = getBlockById(blockId)
  if (!def) return blockId

  switch (blockId) {
    case 'send-payment': {
      const recipient = config.recipient as string
      const amount = config.amount
      const asset = config.asset
      const assetLabel = asset && Number(asset) > 0 ? `ASA ${asset}` : 'ALGO'
      const addr = recipient ? `${recipient.slice(0, 6)}...${recipient.slice(-4)}` : '?'
      return `Send ${amount ?? '?'} ${assetLabel} to ${addr}`
    }
    case 'opt-in-asa':
      return `Opt in to ASA ${config.assetId ?? '?'}`
    case 'create-asa':
      return `Create ASA "${config.name ?? '?'}" (${config.totalSupply ?? '?'} units)`
    case 'swap-token':
      return `Swap ${config.amount ?? '?'} of ASA ${config.fromAsset ?? '?'} → ASA ${config.toAsset ?? '?'}`
    default:
      return def.name
  }
}

export interface TransactionPanelProps {
  isOpen: boolean
  onClose: () => void
  nodes: Node[]
  edges: Edge[]
}

export default function TransactionPanel({
  isOpen,
  onClose,
  nodes,
  edges,
}: TransactionPanelProps) {
  const { transactionSigner, activeAddress } = useWallet()
  const { enqueueSnackbar } = useSnackbar()
  const [executing, setExecuting] = useState(false)
  const [results, setResults] = useState<Record<string, { txId?: string; error?: string }>>({})

  const actionBlocks = getActionBlocksInOrder(
    nodes as { id: string; data: Record<string, unknown> }[],
    edges.map((e) => ({ source: e.source, target: e.target }))
  )

  const handleExecute = async () => {
    if (!transactionSigner || !activeAddress) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    if (actionBlocks.length === 0) {
      enqueueSnackbar('No action blocks to execute', { variant: 'info' })
      return
    }

    setExecuting(true)
    setResults({})

    try {
      const algorand = getAlgorandClient()
      const context = {
        sender: activeAddress,
        signer: transactionSigner,
        algorand,
      }

      const newResults: Record<string, { txId?: string; error?: string }> = {}

      for (const { nodeId, blockId, config } of actionBlocks) {
        const executor = blockExecutors[blockId]
        if (!executor) continue

        try {
          const output = await executor(config, context)
          newResults[nodeId] = { txId: output.txId as string }
          setResults((r) => ({ ...r, ...newResults }))
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          newResults[nodeId] = { error: message }
          setResults((r) => ({ ...r, ...newResults }))
          enqueueSnackbar(`Block failed: ${message}`, { variant: 'error' })
          break
        }
      }

      const successCount = Object.values(newResults).filter((r) => r.txId && !r.error).length
      if (successCount > 0) {
        enqueueSnackbar(`Executed ${successCount} block(s) successfully`, { variant: 'success' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      enqueueSnackbar(`Execution failed: ${message}`, { variant: 'error' })
    } finally {
      setExecuting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="transaction-panel-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      />
      <div
        className="transaction-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(400px, 100vw)',
          height: '100vh',
          background: 'var(--zuik-surface)',
          borderLeft: '1px solid var(--zuik-border)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--zuik-border)',
          }}
        >
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--zuik-text)' }}>
            Execute Flow
          </h2>
          <button
            onClick={onClose}
            className="zuik-btn zuik-btn-ghost zuik-btn-sm"
            style={{ padding: 6 }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {actionBlocks.length === 0 ? (
            <p style={{ color: 'var(--zuik-text-muted)', fontSize: '0.875rem' }}>
              No action blocks in this flow. Add Send Payment, Opt-In ASA, Create ASA, or Swap Token blocks.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {actionBlocks.map(({ nodeId, blockId, config }) => {
                const def = getBlockById(blockId)
                const result = results[nodeId]
                return (
                  <li
                    key={nodeId}
                    style={{
                      padding: 12,
                      background: 'var(--zuik-surface-2)',
                      borderRadius: 8,
                      border: '1px solid var(--zuik-border)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--zuik-text)', marginBottom: 4 }}>
                      {def?.name ?? blockId}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--zuik-text-muted)', marginBottom: 8 }}>
                      {formatConfigSummary(blockId, config)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--zuik-text-dim)' }}>
                      Est. fee: ~0.001 ALGO
                    </div>
                    {result && (
                      <div style={{ marginTop: 8, fontSize: '0.8125rem' }}>
                        {result.txId ? (
                          <a
                            href={`${PERA_EXPLORER_TESTNET}/${result.txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--zuik-success)' }}
                          >
                            View on Explorer →
                          </a>
                        ) : result.error ? (
                          <span style={{ color: 'var(--zuik-error)' }}>{result.error}</span>
                        ) : null}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div
          style={{
            padding: 16,
            borderTop: '1px solid var(--zuik-border)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            className="zuik-btn zuik-btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={executing || actionBlocks.length === 0 || !transactionSigner || !activeAddress}
            className="zuik-btn zuik-btn-primary"
          >
            {executing ? (
              <>
                <span className="loading loading-spinner" style={{ width: 14, height: 14 }} />
                Executing...
              </>
            ) : (
              'Sign & Execute'
            )}
          </button>
        </div>
      </div>
    </>
  )
}
