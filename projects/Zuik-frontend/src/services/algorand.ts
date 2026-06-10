import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import type algosdk from 'algosdk'
import {
  getAlgodConfigFromViteEnvironment,
  getIndexerConfigFromViteEnvironment,
} from '../utils/network/getAlgoClientConfigs'

let _algorand: AlgorandClient | null = null

export function getAlgorandClient(): AlgorandClient {
  if (!_algorand) {
    const algodConfig = getAlgodConfigFromViteEnvironment()
    let indexerConfig: ReturnType<typeof getIndexerConfigFromViteEnvironment> | undefined
    try {
      indexerConfig = getIndexerConfigFromViteEnvironment()
    } catch {
      /* indexer optional */
    }
    _algorand = AlgorandClient.fromConfig({
      algodConfig,
      indexerConfig,
    })
  }
  return _algorand
}

export function getAlgodClient(): algosdk.Algodv2 {
  return getAlgorandClient().client.algod
}

/** Throws if indexer was not configured in env. */
export function getIndexerClient(): algosdk.Indexer {
  return getAlgorandClient().client.indexer
}
