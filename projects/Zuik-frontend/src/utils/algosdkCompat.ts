/** Read asset params from algosdk v3 getAssetByID responses. */
export function readAssetParams(asset: unknown): Record<string, unknown> {
  const raw = asset as unknown as Record<string, unknown>
  const params = raw.params
  if (params && typeof params === 'object') {
    return params as Record<string, unknown>
  }
  return raw
}

export function readAssetDecimals(asset: unknown, fallback = 6): number {
  const params = readAssetParams(asset)
  const decimals = params.decimals
  return typeof decimals === 'bigint' ? Number(decimals) : Number(decimals ?? fallback)
}

export function readAccountAmountMicro(acct: { amount?: bigint | number }): number {
  const amount = acct.amount
  if (typeof amount === 'bigint') return Number(amount)
  return Number(amount ?? 0)
}

export function readSuggestedMinFee(params: { minFee?: bigint | number }, fallback = 1000): number {
  const minFee = params.minFee
  if (typeof minFee === 'bigint') return Number(minFee)
  return Number(minFee ?? fallback)
}

export function readAssetHoldingId(holding: { assetId?: bigint | number }): number {
  const id = holding.assetId
  if (typeof id === 'bigint') return Number(id)
  return Number(id ?? 0)
}

export function readAssetHoldingAmount(holding: { amount?: bigint | number }): number {
  const amount = holding.amount
  if (typeof amount === 'bigint') return Number(amount)
  return Number(amount ?? 0)
}
