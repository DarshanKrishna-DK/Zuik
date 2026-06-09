import { x402Client } from '@x402-avm/core/client'
import { wrapFetchWithPayment } from '@x402-avm/fetch'
import { decodePaymentResponseHeader } from '@x402-avm/core/http'
import { ALGORAND_TESTNET_CAIP2 } from '@x402-avm/avm'
import type { AgentExecutionContext } from './agentSigner.js'
import { GuardianExactAvmClientScheme } from './guardianX402Scheme.js'
import { readGuardianContext, maxSpendableMicroAlgos } from './guardianPolicy.js'
import { getAlgodClient } from './algorand.js'

export interface X402FetchResult<T> {
  data: T
  paid: boolean
  paymentTxId?: string
}

/**
 * Build an x402 client that signs Guardian-wrapped ALGO payments for the agent sub-account.
 */
export function createGuardianX402Client(agent: AgentExecutionContext): x402Client {
  const guardianScheme = new GuardianExactAvmClientScheme(
    agent.agentAddress,
    agent.signer,
    agent.guardianAppId,
  )

  const client = new x402Client()
  client.register(ALGORAND_TESTNET_CAIP2, guardianScheme)

  client.onBeforePaymentCreation(async (ctx) => {
    const req = ctx.selectedRequirements
    const amount = BigInt(req.amount ?? '0')
    const guardian = await readGuardianContext(agent.guardianAppId, agent.agentAddress)
    const headroom = maxSpendableMicroAlgos(guardian)
    if (guardian.blocked) {
      return { abort: true, reason: `Guardian blocked: ${guardian.blockReason ?? 'policy limit'}` }
    }
    if (amount > headroom) {
      return {
        abort: true,
        reason: `Payment ${amount} microAlgos exceeds Guardian headroom ${headroom}`,
      }
    }
    console.log(
      `[x402/client] Paying ${amount} microAlgos to ${req.payTo?.slice(0, 8)}... ` +
        `(Guardian headroom ${headroom})`,
    )
  })

  return client
}

/**
 * Fetch a URL with automatic x402 payment using Guardian-enforced agent signing.
 */
export async function fetchWithGuardianX402<T = unknown>(
  agent: AgentExecutionContext,
  url: string,
  init?: RequestInit,
): Promise<X402FetchResult<T>> {
  const client = createGuardianX402Client(agent)
  const fetchWithPay = wrapFetchWithPayment(fetch, client)

  const response = await fetchWithPay(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`x402 fetch failed HTTP ${response.status}: ${body.slice(0, 300)}`)
  }

  const paymentResponseHeader = response.headers.get('payment-response')
    ?? response.headers.get('PAYMENT-RESPONSE')
  let paymentTxId: string | undefined
  if (paymentResponseHeader) {
    try {
      const settled = decodePaymentResponseHeader(paymentResponseHeader)
      if (settled.success && settled.transaction) {
        paymentTxId = settled.transaction
      }
    } catch {
      // best effort
    }
  }

  const data = await response.json() as T
  return {
    data,
    paid: Boolean(paymentTxId),
    paymentTxId,
  }
}

/** Preflight agent balance for x402 spend (microAlgos). */
export async function getAgentBalanceMicroAlgos(address: string): Promise<bigint> {
  const algod = getAlgodClient()
  const acct = await algod.accountInformation(address).do()
  return BigInt(acct.amount ?? 0)
}
