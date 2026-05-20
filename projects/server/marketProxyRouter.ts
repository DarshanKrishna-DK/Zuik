import { Router, type Request } from 'express'

const VESTIGE_BASE = 'https://free-api.vestige.fi'
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

function queryString(req: Request): string {
  const q = req.url.indexOf('?')
  return q >= 0 ? req.url.slice(q + 1) : ''
}

async function proxyGet(baseUrl: string, path: string, query: string): Promise<Response> {
  const url = `${baseUrl}${path}${query ? `?${query}` : ''}`
  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ZuikServer/1.0 (market proxy)',
    },
  })
}

export function createMarketProxyRouter(): Router {
  const router = Router()

  router.use(async (req, res) => {
    const path = req.path
    const query = queryString(req)

    let baseUrl: string | null = null
    let upstreamPath: string | null = null

    if (path.startsWith('/vestige/')) {
      baseUrl = VESTIGE_BASE
      upstreamPath = path.slice('/vestige'.length)
    } else if (path.startsWith('/coingecko/')) {
      baseUrl = COINGECKO_BASE
      upstreamPath = path.slice('/coingecko'.length)
    } else {
      return res.status(404).json({ error: 'Unknown market proxy path' })
    }

    try {
      const upstream = await proxyGet(baseUrl, upstreamPath, query)
      const text = await upstream.text()
      res.status(upstream.status).type('json').send(text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.status(502).json({ error: msg })
    }
  })

  return router
}
