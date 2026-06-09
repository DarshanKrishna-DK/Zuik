import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import {
  dismissPendingTransaction,
  getPendingTransaction,
  rejectPendingTransaction,
  signPreparedTransaction,
  subscribePendingTransaction,
  type ComplianceCheck,
  type PreparedVoiceTransaction,
} from '../../services/voiceAssistant/transactionPrep'
import './TransactionApproval.css'

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function ComplianceRow({ check }: { check: ComplianceCheck }) {
  const icon = check.passed ? '✓' : check.severity === 'error' ? '✕' : '!'
  return (
    <li
      className={`va-tx-check va-tx-check--${check.passed ? 'pass' : check.severity}`}
      data-testid={`tx-compliance-${check.id}`}
    >
      <span className="va-tx-check-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span className="va-tx-check-label">{check.label}</span>
        <p className="va-tx-check-msg">{check.message}</p>
      </div>
    </li>
  )
}

export interface TransactionApprovalProps {
  /** Expand the voice assistant panel when a transaction is prepared. */
  onRequestExpand?: () => void
  openWalletModal?: () => void
}

export default function TransactionApproval({
  onRequestExpand,
  openWalletModal,
}: TransactionApprovalProps) {
  const { activeAddress, transactionSigner } = useWallet()
  const [tx, setTx] = useState<PreparedVoiceTransaction | null>(() => getPendingTransaction())
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    return subscribePendingTransaction((pending) => {
      setTx(pending)
      if (pending?.status === 'awaiting_approval') {
        onRequestExpand?.()
      }
    })
  }, [onRequestExpand])

  const needsWalletSign = tx?.kind === 'wallet_payment' || tx?.kind === 'fund_agent'
  const canApprove =
    tx?.status === 'awaiting_approval' &&
    !busy &&
    (tx.kind === 'agent_payment'
      ? !!activeAddress
      : !!transactionSigner && !!activeAddress)

  const handleReject = useCallback(() => {
    rejectPendingTransaction()
    setLocalError(null)
  }, [])

  const handleDismiss = useCallback(() => {
    dismissPendingTransaction()
    setLocalError(null)
  }, [])

  const handleApprove = useCallback(async () => {
    if (!tx || tx.status !== 'awaiting_approval') return

    if (needsWalletSign && (!transactionSigner || !activeAddress)) {
      openWalletModal?.()
      setLocalError('Connect your wallet to sign this transaction.')
      return
    }

    setBusy(true)
    setLocalError(null)

    try {
      if (needsWalletSign) {
        if (!transactionSigner) {
          openWalletModal?.()
          setLocalError('Connect your wallet to sign this transaction.')
          return
        }
        await signPreparedTransaction(tx, transactionSigner)
      } else {
        await signPreparedTransaction(tx)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setLocalError(message)
    } finally {
      setBusy(false)
    }
  }, [tx, needsWalletSign, transactionSigner, activeAddress, openWalletModal])

  if (!tx) return null

  const showPanel =
    tx.status === 'awaiting_approval' ||
    tx.status === 'signing' ||
    tx.status === 'confirmed' ||
    tx.status === 'failed'

  if (!showPanel) return null

  const blocking = tx.compliance.some((c) => !c.passed && c.severity === 'error')

  return (
    <section
      className={`va-tx-panel va-tx-panel--${tx.status}`}
      data-testid="voice-transaction-approval"
      aria-live="polite"
      aria-label="Transaction approval"
    >
      <header className="va-tx-header">
        <div>
          <p className="va-tx-eyebrow">Voice transaction</p>
          <h3 className="va-tx-title">{tx.title}</h3>
        </div>
        <button
          type="button"
          className="va-tx-close"
          onClick={handleDismiss}
          aria-label="Dismiss transaction panel"
        >
          ×
        </button>
      </header>

      <p className="va-tx-summary">{tx.summary}</p>

      <dl className="va-tx-details">
        <div>
          <dt>Amount</dt>
          <dd>{tx.amountDisplay}</dd>
        </div>
        <div>
          <dt>From</dt>
          <dd title={tx.sender}>{shortAddr(tx.sender)}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd title={tx.recipient}>{shortAddr(tx.recipient)}</dd>
        </div>
        {tx.agentAddress && tx.kind !== 'fund_agent' && (
          <div>
            <dt>Agent</dt>
            <dd title={tx.agentAddress}>{shortAddr(tx.agentAddress)}</dd>
          </div>
        )}
      </dl>

      {tx.compliance.length > 0 && (
        <div className="va-tx-compliance">
          <p className="va-tx-section-label">Compliance checks</p>
          <ul>
            {tx.compliance.map((check) => (
              <ComplianceRow key={check.id} check={check} />
            ))}
          </ul>
        </div>
      )}

      {tx.status === 'awaiting_approval' && (
        <div className="va-tx-steps">
          <p className="va-tx-section-label">Next steps</p>
          <ol>
            {tx.approvalSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {tx.status === 'signing' && (
        <p className="va-tx-status-msg" data-testid="tx-status-signing">
          Waiting for wallet signature...
        </p>
      )}

      {tx.status === 'confirmed' && tx.txId && (
        <p className="va-tx-status-msg va-tx-status-msg--success" data-testid="tx-status-confirmed">
          Confirmed. Tx ID: {shortAddr(tx.txId)}
        </p>
      )}

      {(tx.status === 'failed' || localError) && (
        <p className="va-tx-status-msg va-tx-status-msg--error" data-testid="tx-status-error">
          {localError ?? tx.error ?? 'Transaction failed.'}
        </p>
      )}

      <div className="va-tx-actions">
        {tx.status === 'awaiting_approval' && (
          <>
            <button
              type="button"
              className="va-tx-btn va-tx-btn--ghost"
              onClick={handleReject}
              disabled={busy}
              data-testid="tx-reject-btn"
            >
              Cancel
            </button>
            <button
              type="button"
              className="va-tx-btn va-tx-btn--primary"
              onClick={handleApprove}
              disabled={!canApprove || blocking}
              data-testid="tx-approve-btn"
            >
              {busy
                ? 'Processing...'
                : needsWalletSign
                  ? 'Approve and sign'
                  : 'Approve and send'}
            </button>
          </>
        )}
        {(tx.status === 'confirmed' || tx.status === 'failed') && (
          <button
            type="button"
            className="va-tx-btn va-tx-btn--primary"
            onClick={handleDismiss}
            data-testid="tx-dismiss-btn"
          >
            Done
          </button>
        )}
      </div>

      {needsWalletSign && !transactionSigner && tx.status === 'awaiting_approval' && (
        <p className="va-tx-hint">
          Wallet not connected.{' '}
          {openWalletModal ? (
            <button type="button" className="va-tx-link" onClick={openWalletModal}>
              Connect wallet
            </button>
          ) : (
            'Connect your wallet to continue.'
          )}
        </p>
      )}
    </section>
  )
}
