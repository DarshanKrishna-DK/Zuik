const SABER_BASE_URL =
  import.meta.env.VITE_SABER_BASE_URL || 'https://api.sandbox.saber.money'
const SABER_WIDGET_URL =
  import.meta.env.VITE_SABER_WIDGET_URL || 'https://app.sandbox.saber.money'
const SABER_CLIENT_ID = import.meta.env.VITE_SABER_CLIENT_ID || ''
const SABER_CLIENT_SECRET = import.meta.env.VITE_SABER_CLIENT_SECRET || ''

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function getTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

async function generateAdminSignature(): Promise<{
  signature: string
  timestamp: string
}> {
  const timestamp = getTimestamp()
  const sigString = SABER_CLIENT_ID + timestamp
  const signature = await hmacSha256(sigString, SABER_CLIENT_SECRET)
  return { signature, timestamp }
}

async function generateUserSignature(userId: string): Promise<{
  signature: string
  timestamp: string
}> {
  const timestamp = getTimestamp()
  const sigString = SABER_CLIENT_ID + timestamp + userId
  const signature = await hmacSha256(sigString, SABER_CLIENT_SECRET)
  return { signature, timestamp }
}

async function generateSdkSignature(userId: string): Promise<{
  signature: string
  timestamp: string
}> {
  const timestamp = getTimestamp()
  const sigString = SABER_CLIENT_ID + timestamp + 'sdk' + userId
  const signature = await hmacSha256(sigString, SABER_CLIENT_SECRET)
  return { signature, timestamp }
}

function saberHeaders(
  signature: string,
  timestamp: string,
  userId?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-KEY': SABER_CLIENT_ID,
    'X-SIGNATURE': signature,
    'X-Timestamp': timestamp,
    'X-Request-Id': crypto.randomUUID(),
  }
  if (userId) headers['X-User-Id'] = userId
  return headers
}

// ── Public API ──────────────────────────────────────────────

export interface SaberUser {
  userId: string
  email: string
  phone: string
}

export async function createSaberUser(params: {
  email: string
  phone: string
  clientUserId?: string
}): Promise<{ success: boolean; userId?: string; error?: string }> {
  if (!SABER_CLIENT_ID || !SABER_CLIENT_SECRET) {
    return { success: false, error: 'Saber API credentials not configured' }
  }

  const { signature, timestamp } = await generateAdminSignature()
  const userUuid = crypto.randomUUID()

  try {
    const resp = await fetch(`${SABER_BASE_URL}/api/v1/user/client_user`, {
      method: 'POST',
      headers: saberHeaders(signature, timestamp),
      body: JSON.stringify({
        user_uuid: userUuid,
        client_user_id: params.clientUserId || `zuik-${Date.now()}`,
        email: params.email,
        phone: params.phone,
      }),
    })
    const data = await resp.json()
    if (data.success) {
      return { success: true, userId: userUuid }
    }
    return { success: false, error: data.message || 'User creation failed' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function getKycWidgetUrl(userId: string): string {
  return `${SABER_WIDGET_URL}/kyc?client_id=${SABER_CLIENT_ID}&user_id=${userId}`
}

export async function getKycWidgetUrlSigned(
  userId: string,
): Promise<string> {
  const { signature, timestamp } = await generateSdkSignature(userId)
  const params = new URLSearchParams({
    client_id: SABER_CLIENT_ID,
    user_id: userId,
    timestamp,
    secret: signature,
  })
  return `${SABER_WIDGET_URL}/kyc?${params.toString()}`
}

export interface BuyQuote {
  fromCurrency: string
  toCurrency: string
  fromAmount: number
  toAmount: number
  basePrice: number
  finalPrice: number
  totalFee: number
  feeBreakup: {
    platformFee: number
    networkFee: number
    clientFee: number
    discount: number
    taxOnFee: number
    tds: number
  }
}

export async function getFiatBuyQuote(params: {
  fromCurrency: string
  toCurrency: string
  network: string
  fromAmount?: number
  toAmount?: number
  userId: string
}): Promise<{ success: boolean; quote?: BuyQuote; error?: string }> {
  if (!SABER_CLIENT_ID || !SABER_CLIENT_SECRET) {
    return { success: false, error: 'Saber API credentials not configured' }
  }

  const { signature, timestamp } = await generateUserSignature(params.userId)

  const qp = new URLSearchParams({
    from_currency: params.fromCurrency,
    to_currency: params.toCurrency,
    network: params.network,
  })
  if (params.fromAmount) qp.set('from_amount', String(params.fromAmount))
  if (params.toAmount) qp.set('to_amount', String(params.toAmount))

  try {
    const resp = await fetch(
      `${SABER_BASE_URL}/api/v2/wallet/w/quote?${qp.toString()}`,
      {
        method: 'GET',
        headers: saberHeaders(signature, timestamp, params.userId),
      },
    )
    const data = await resp.json()
    if (data.success) {
      const d = data.data
      return {
        success: true,
        quote: {
          fromCurrency: d.from_currency,
          toCurrency: d.to_currency,
          fromAmount: d.from_amount,
          toAmount: d.to_amount,
          basePrice: d.base_price,
          finalPrice: d.final_price,
          totalFee: d.total_fee,
          feeBreakup: {
            platformFee: d.fee_breakup?.platform_fee ?? 0,
            networkFee: d.fee_breakup?.network_fee ?? 0,
            clientFee: d.fee_breakup?.client_fee ?? 0,
            discount: d.fee_breakup?.discount ?? 0,
            taxOnFee: d.fee_breakup?.tax_on_fee ?? 0,
            tds: d.fee_breakup?.tds ?? 0,
          },
        },
      }
    }
    return { success: false, error: data.message || 'Quote fetch failed' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export interface OnRampWidgetParams {
  userId: string
  walletAddress: string
  fiatAmount?: number
  cryptoAmount?: number
  fiatCurrency?: string
  cryptoSymbol?: string
  network?: string
  redirectUrl?: string
}

export async function generateOnRampWidgetUrl(
  params: OnRampWidgetParams,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!SABER_CLIENT_ID || !SABER_CLIENT_SECRET) {
    return { success: false, error: 'Saber API credentials not configured' }
  }

  const { signature, timestamp } = await generateSdkSignature(params.userId)
  const transactionId = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

  const qp = new URLSearchParams({
    client_id: SABER_CLIENT_ID,
    user_id: params.userId,
    timestamp,
    secret: signature,
    wallet_address: params.walletAddress,
    transaction_id: transactionId,
  })

  if (params.fiatAmount) qp.set('fiat_amount', String(params.fiatAmount))
  if (params.cryptoAmount) qp.set('crypto_amount', String(params.cryptoAmount))
  if (params.fiatCurrency) qp.set('fiat_currency', params.fiatCurrency)
  if (params.cryptoSymbol) qp.set('crypto_symbol', params.cryptoSymbol)
  if (params.network) qp.set('network', params.network)
  if (params.redirectUrl) qp.set('redirect_url', params.redirectUrl)

  return {
    success: true,
    url: `${SABER_WIDGET_URL}/onramp?${qp.toString()}`,
  }
}

export async function initiateSellTransaction(params: {
  userId: string
  sourceId: string
  fiatSymbol: string
  cryptoSymbol: string
  fiatAmount?: number
  cryptoAmount?: number
  paymentMethod?: string
}): Promise<{
  success: boolean
  transactionId?: string
  status?: string
  exchangeRate?: number
  error?: string
}> {
  if (!SABER_CLIENT_ID || !SABER_CLIENT_SECRET) {
    return { success: false, error: 'Saber API credentials not configured' }
  }

  const { signature, timestamp } = await generateUserSignature(params.userId)

  const body: Record<string, unknown> = {
    source_id: params.sourceId,
    fiat_symbol: params.fiatSymbol,
    crypto_symbol: params.cryptoSymbol,
    payment_method: params.paymentMethod || 'bank_transfer',
  }
  if (params.fiatAmount) body.fiat_amount = params.fiatAmount
  if (params.cryptoAmount) body.crypto_amount = params.cryptoAmount

  try {
    const resp = await fetch(
      `${SABER_BASE_URL}/api/v1/wallet/conversion/fiat/sell`,
      {
        method: 'POST',
        headers: saberHeaders(signature, timestamp, params.userId),
        body: JSON.stringify(body),
      },
    )
    const data = await resp.json()
    if (data.success) {
      const d = data.data
      return {
        success: true,
        transactionId: d.id,
        status: d.status,
        exchangeRate: d.exchange_rate,
      }
    }
    return { success: false, error: data.message || 'Sell transaction failed' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function getDepositAddress(params: {
  userId: string
  symbol: string
}): Promise<{
  success: boolean
  addresses?: { network: string; address: string; tag: string }[]
  error?: string
}> {
  if (!SABER_CLIENT_ID || !SABER_CLIENT_SECRET) {
    return { success: false, error: 'Saber API credentials not configured' }
  }

  const { signature, timestamp } = await generateUserSignature(params.userId)

  try {
    const resp = await fetch(
      `${SABER_BASE_URL}/api/v1/wallet/user_deposit_address?symbol=${params.symbol}`,
      {
        method: 'GET',
        headers: saberHeaders(signature, timestamp, params.userId),
      },
    )
    const data = await resp.json()
    if (data.success) {
      return {
        success: true,
        addresses: data.data.map(
          (a: { network: string; address: string; tag: string }) => ({
            network: a.network,
            address: a.address,
            tag: a.tag,
          }),
        ),
      }
    }
    return {
      success: false,
      error: data.message || 'Deposit address fetch failed',
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function isSaberConfigured(): boolean {
  return Boolean(SABER_CLIENT_ID && SABER_CLIENT_SECRET)
}
