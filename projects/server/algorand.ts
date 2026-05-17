import algosdk from 'algosdk'

const ALGOD_URL = process.env.ALGOD_URL ?? 'https://testnet-api.4160.nodely.dev'
const ALGOD_TOKEN = process.env.ALGOD_TOKEN ?? ''
const ALGOD_PORT = process.env.ALGOD_PORT ? Number(process.env.ALGOD_PORT) : ''

let algod: algosdk.Algodv2 | null = null

export function getAlgodClient(): algosdk.Algodv2 {
  if (!algod) {
    algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, ALGOD_PORT)
  }
  return algod
}

export async function getAssetDecimals(assetId: number): Promise<number> {
  if (assetId === 0) return 6
  try {
    const client = getAlgodClient()
    const info = await client.getAssetByID(BigInt(assetId)).do()
    const params = (info as Record<string, unknown>).params ?? info
    return Number((params as Record<string, unknown>).decimals ?? 6)
  } catch {
    return 6
  }
}
