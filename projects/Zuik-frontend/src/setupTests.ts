import '@testing-library/jest-dom'
import { afterEach, beforeEach, vi } from 'vitest'

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_GUARDIAN_APP_ID: '764398655',
    VITE_GUARDIAN_APP_ADDRESS: 'RMZRRH5YEVQCAXLSPYDUG7RTCXNJ6MHA77KGDC3DMNRHG3SYNLVW32YS2M',
    VITE_ALGOD_NETWORK: 'testnet',
    VITE_ALGOD_SERVER: 'https://testnet-api.4160.nodely.dev',
    VITE_INDEXER_SERVER: 'https://testnet-idx.4160.nodely.dev'
  }
})

// Mock console.warn for cleaner test output
const originalWarn = console.warn
beforeEach(() => {
  console.warn = vi.fn()
})

afterEach(() => {
  console.warn = originalWarn
})