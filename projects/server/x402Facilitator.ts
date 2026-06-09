import { x402Facilitator } from '@x402-avm/core/facilitator'
import type { FacilitatorClient, PaymentPayload, PaymentRequirements, SettleResponse, SupportedResponse, VerifyResponse } from '@x402-avm/core/types'
import { ALGORAND_TESTNET_CAIP2 } from '@x402-avm/avm'
import { Router } from 'express'
import {
  GuardianExactAvmFacilitatorScheme,
  createZuikFacilitatorSigner,
} from './guardianX402Scheme.js'

const GUARDIAN_APP_ID = Number(process.env.GUARDIAN_APP_ID ?? process.env.VITE_GUARDIAN_APP_ID ?? 763727553)

let guardianFacilitator: x402Facilitator | null = null

export function getGuardianX402Facilitator(): x402Facilitator {
  if (!guardianFacilitator) {
    const scheme = new GuardianExactAvmFacilitatorScheme(
      createZuikFacilitatorSigner(),
      GUARDIAN_APP_ID,
    )
    guardianFacilitator = new x402Facilitator()
    guardianFacilitator.register(ALGORAND_TESTNET_CAIP2, scheme)
  }
  return guardianFacilitator
}

/** In-process facilitator client for the Zuik x402 resource server. */
export class LocalGuardianFacilitatorClient implements FacilitatorClient {
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return getGuardianX402Facilitator().verify(paymentPayload, paymentRequirements)
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    return getGuardianX402Facilitator().settle(paymentPayload, paymentRequirements)
  }

  async getSupported(): Promise<SupportedResponse> {
    return {
      kinds: [
        {
          x402Version: 2,
          scheme: 'exact',
          network: ALGORAND_TESTNET_CAIP2,
          extra: { guardianAppId: GUARDIAN_APP_ID },
        },
      ],
      extensions: [],
    }
  }
}

export function createX402FacilitatorRouter(): Router {
  const router = Router()
  const facilitator = getGuardianX402Facilitator()

  router.get('/supported', async (_req, res) => {
    try {
      const client = new LocalGuardianFacilitatorClient()
      res.json(await client.getSupported())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[x402/facilitator] supported error:', msg)
      res.status(500).json({ error: msg })
    }
  })

  router.post('/verify', async (req, res) => {
    try {
      const { paymentPayload, paymentRequirements } = req.body ?? {}
      const result = await facilitator.verify(paymentPayload, paymentRequirements)
      res.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[x402/facilitator] verify error:', msg)
      res.status(500).json({ isValid: false, invalidReason: msg })
    }
  })

  router.post('/settle', async (req, res) => {
    try {
      const { paymentPayload, paymentRequirements } = req.body ?? {}
      const result = await facilitator.settle(paymentPayload, paymentRequirements)
      res.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[x402/facilitator] settle error:', msg)
      res.status(500).json({ success: false, errorReason: msg, transaction: '' })
    }
  })

  return router
}
