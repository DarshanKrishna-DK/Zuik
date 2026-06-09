import { Router } from 'express'
import { paymentMiddlewareFromConfig } from '@x402-avm/express'
import { x402ResourceServer } from '@x402-avm/core/server'
import { registerExactAvmScheme } from '@x402-avm/avm/exact/server'
import { ALGORAND_TESTNET_CAIP2 } from '@x402-avm/avm'
import { fetchPremiumAlgoQuote } from './premiumMarketData.js'
import { LocalGuardianFacilitatorClient } from './x402Facilitator.js'

const X402_PAYTO =
  process.env.X402_PAYTO_ADDRESS
  ?? process.env.X402_PAYTO
  ?? 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'

/** Default 0.01 ALGO per premium quote (testnet-friendly). */
const X402_PREMIUM_PRICE_MICROALGOS = String(
  process.env.X402_PREMIUM_PRICE_MICROALGOS ?? '10000',
)

const facilitatorClient = new LocalGuardianFacilitatorClient()
const resourceServer = new x402ResourceServer(facilitatorClient)
registerExactAvmScheme(resourceServer)

const premiumRoutes = {
  'GET /premium/algo-quote': {
    accepts: {
      scheme: 'exact',
      network: ALGORAND_TESTNET_CAIP2,
      payTo: X402_PAYTO,
      price: {
        amount: X402_PREMIUM_PRICE_MICROALGOS,
        asset: '0',
        extra: { name: 'ALGO', decimals: 6 },
      },
    },
    description: 'Premium ALGO market quote with 24h change, volume, and market cap',
    mimeType: 'application/json',
    unpaidResponseBody: () => ({
      contentType: 'application/json',
      body: {
        error: 'Payment required',
        message: 'Pay with ALGO on TestNet to access premium market data. Guardian policy applies.',
        priceMicroAlgos: X402_PREMIUM_PRICE_MICROALGOS,
        payTo: X402_PAYTO,
      },
    }),
  },
}

export function createX402PremiumRouter(): Router {
  const router = Router()

  router.use(
    paymentMiddlewareFromConfig(
      premiumRoutes,
      facilitatorClient,
      [{ network: 'algorand:*', server: resourceServer }],
      undefined,
      undefined,
      false,
    ),
  )

  router.get('/premium/algo-quote', async (req, res) => {
    const coinId = typeof req.query.coin === 'string' && req.query.coin.trim()
      ? req.query.coin.trim()
      : 'algorand'

    const quote = await fetchPremiumAlgoQuote(coinId)
    if (!quote) {
      console.error('[x402/premium] Upstream premium data unavailable')
      return res.status(503).json({
        error: 'Premium data source unavailable',
        coinId,
      })
    }

    console.log(
      `[x402/premium] Served quote for ${coinId}: $${quote.priceUsd} ` +
        `(paid endpoint, ${X402_PREMIUM_PRICE_MICROALGOS} microAlgos)`,
    )
    res.json(quote)
  })

  router.get('/config', (_req, res) => {
    res.json({
      network: ALGORAND_TESTNET_CAIP2,
      payTo: X402_PAYTO,
      priceMicroAlgos: X402_PREMIUM_PRICE_MICROALGOS,
      asset: '0',
      endpoint: '/api/x402/premium/algo-quote',
    })
  })

  return router
}
