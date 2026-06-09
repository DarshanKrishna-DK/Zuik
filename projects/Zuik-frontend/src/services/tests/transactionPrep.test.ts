import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildUnsignedPaymentPreview,
  dismissPendingTransaction,
  getPendingTransaction,
  prepareFundAgent,
  prepareWalletPayment,
  rejectPendingTransaction,
  subscribePendingTransaction,
  validateTokenRiskCompliance,
} from '../voiceAssistant/transactionPrep'

const VALID_ADDRESS = 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'

vi.mock('../algorand', () => ({
  getAlgorandClient: vi.fn().mockReturnValue({
    client: {
      algod: {
        status: vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({ 'last-round': 1000 }),
        }),
        accountInformation: vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            amount: 10_000_000,
            'min-balance': 100_000,
          }),
        }),
      },
    },
  }),
}))

vi.mock('../tokenRisk', () => ({
  computeRiskScore: vi.fn(),
  riskBandLabel: vi.fn().mockReturnValue('low'),
}))

describe('transactionPrep', () => {
  beforeEach(() => {
    dismissPendingTransaction()
  })

  it('validates ALGO token risk as passing', async () => {
    const checks = await validateTokenRiskCompliance(0)
    expect(checks.some((c) => c.id === 'token_risk' && c.passed)).toBe(true)
  })

  it('rejects invalid recipient during wallet payment preparation', async () => {
    const tx = await prepareWalletPayment({
      sender: VALID_ADDRESS,
      recipient: 'not-an-address',
      amountAlgo: 1,
    })

    expect(tx.status).toBe('failed')
    expect(tx.compliance.some((c) => c.id === 'recipient_valid' && !c.passed)).toBe(true)
    expect(tx.voicePrompt.toLowerCase()).toContain('compliance')
  })

  it('prepares valid wallet payment for approval', async () => {
    const tx = await prepareWalletPayment({
      sender: VALID_ADDRESS,
      recipient: VALID_ADDRESS,
      amountAlgo: 0.1,
    })

    expect(tx.status).toBe('awaiting_approval')
    expect(tx.kind).toBe('wallet_payment')
    expect(tx.approvalSteps.length).toBeGreaterThan(0)
    expect(tx.voicePrompt.toLowerCase()).toContain('approval')
    expect(getPendingTransaction()?.id).toBe(tx.id)
  })

  it('prepares fund agent transaction with approval steps', async () => {
    const tx = await prepareFundAgent({
      ownerAddress: VALID_ADDRESS,
      agentAddress: VALID_ADDRESS,
      amountAlgo: 2,
    })

    expect(tx.kind).toBe('fund_agent')
    expect(tx.status).toBe('awaiting_approval')
    expect(tx.approvalSteps.some((s) => s.toLowerCase().includes('wallet'))).toBe(true)
  })

  it('tracks pending transaction subscription lifecycle', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePendingTransaction(listener)

    expect(listener).toHaveBeenCalledWith(null)

    void prepareWalletPayment({
      sender: VALID_ADDRESS,
      recipient: VALID_ADDRESS,
      amountAlgo: 0.05,
    }).then(() => {
      expect(listener).toHaveBeenCalled()
    })

    unsubscribe()
  })

  it('rejects and clears pending transaction', async () => {
    await prepareWalletPayment({
      sender: VALID_ADDRESS,
      recipient: VALID_ADDRESS,
      amountAlgo: 0.05,
    })

    rejectPendingTransaction('User cancelled')
    expect(getPendingTransaction()?.status).toBe('rejected')

    dismissPendingTransaction()
    expect(getPendingTransaction()).toBeNull()
  })

  it('returns unsigned payment preview fee estimate', async () => {
    const preview = await buildUnsignedPaymentPreview({
      sender: VALID_ADDRESS,
      recipient: VALID_ADDRESS,
      amountMicroAlgos: 100_000n,
    })
    expect(preview.fee).toBeGreaterThan(0)
  })
})
