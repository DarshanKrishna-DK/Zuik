import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import type algosdk from 'algosdk'
import {
  getAlgodConfigFromViteEnvironment,
  getIndexerConfigFromViteEnvironment,
} from '../utils/network/getAlgoClientConfigs'

let _algorand: AlgorandClient | null = null

/**
 * Creates and returns a shared AlgorandClient instance from env config.
 * Uses algod and indexer configs from Vite environment variables.
 */
export function getAlgorandClient(): AlgorandClient {
  if (!_algorand) {
    const algodConfig = getAlgodConfigFromViteEnvironment()
    let indexerConfig: ReturnType<typeof getIndexerConfigFromViteEnvironment> | undefined
    try {
      indexerConfig = getIndexerConfigFromViteEnvironment()
    } catch {
      // Indexer is optional; continue without it
    }
    _algorand = AlgorandClient.fromConfig({
      algodConfig,
      indexerConfig,
    })
  }
  return _algorand
}

/**
 * Returns the raw algosdk Algodv2 client from the shared AlgorandClient.
 */
export function getAlgodClient(): algosdk.Algodv2 {
  return getAlgorandClient().client.algod
}

/**
 * Returns the raw algosdk Indexer client from the shared AlgorandClient.
 * Throws if indexer was not configured.
 */
export function getIndexerClient(): algosdk.Indexer {
  return getAlgorandClient().client.indexer
}
