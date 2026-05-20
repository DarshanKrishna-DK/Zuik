import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface DemoScenarios {
  aiWorkflow: { intent: string }
  aiEdit: { editIntent: string }
  trading: { marketAsset: string; swapIntent: string }
  guardian: { dailyCapAlgo: string }
  logicSig: { maxPerTrade: string; dailyCap: string; expiryDays: string }
}

export interface DemoConfig {
  baseUrl: string
  startServer: boolean
  headless: boolean
  slowMo: number
  defaultTimeoutMs: number
  walletWaitMs: number
  screenshotDir: string
  skipWallet: boolean
  scenarios: DemoScenarios
}

const DEMO_ROOT = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(DEMO_ROOT, '..', 'demo.config.json')

function loadJsonConfig(): Partial<DemoConfig> {
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Partial<DemoConfig>
  } catch {
    return {}
  }
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key]
  if (v === undefined) return fallback
  return v === '1' || v.toLowerCase() === 'true'
}

function envNum(key: string, fallback: number): number {
  const v = process.env[key]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function defaultScenarios(): DemoScenarios {
  const defaultAiIntent =
    process.env.DEMO_AI_INTENT ??
    'When I receive USDC in my wallet, swap it all to ALGO and notify me on Telegram'

  return {
    aiWorkflow: { intent: defaultAiIntent },
    aiEdit: {
      editIntent:
        process.env.DEMO_AI_EDIT_INTENT ??
        'Extend this workflow: add a timer loop that runs every hour to DCA 5 USDC into ALGO, spawn a second agent for price alerts when ALGO drops below 0.15, and keep the wallet trigger for incoming USDC swaps',
    },
    trading: {
      marketAsset: process.env.DEMO_MARKET_ASSET ?? '31566704',
      swapIntent: process.env.DEMO_SWAP_INTENT ?? 'Swap 10 USDC to ALGO when I receive USDC',
    },
    guardian: { dailyCapAlgo: process.env.DEMO_GUARDIAN_CAP ?? '2' },
    logicSig: {
      maxPerTrade: process.env.DEMO_LS_MAX_TRADE ?? '1',
      dailyCap: process.env.DEMO_LS_DAILY_CAP ?? '5',
      expiryDays: process.env.DEMO_LS_EXPIRY_DAYS ?? '30',
    },
  }
}

export function loadDemoConfig(): DemoConfig {
  const file = loadJsonConfig()
  const defaults = defaultScenarios()
  const fileScenarios = file.scenarios
  const scenarios: DemoScenarios = fileScenarios
    ? {
        aiWorkflow: { ...defaults.aiWorkflow, ...fileScenarios.aiWorkflow },
        aiEdit: { ...defaults.aiEdit, ...fileScenarios.aiEdit },
        trading: { ...defaults.trading, ...fileScenarios.trading },
        guardian: { ...defaults.guardian, ...fileScenarios.guardian },
        logicSig: { ...defaults.logicSig, ...fileScenarios.logicSig },
      }
    : defaults

  return {
    baseUrl: process.env.DEMO_BASE_URL ?? file.baseUrl ?? 'http://localhost:5173',
    startServer: envBool('DEMO_START_SERVER', file.startServer ?? true),
    headless: envBool('DEMO_HEADLESS', file.headless ?? false),
    slowMo: envNum('DEMO_SLOW_MO', file.slowMo ?? 80),
    defaultTimeoutMs: envNum('DEMO_TIMEOUT_MS', file.defaultTimeoutMs ?? 30_000),
    walletWaitMs: envNum('DEMO_WALLET_WAIT_MS', file.walletWaitMs ?? 120_000),
    screenshotDir: process.env.DEMO_SCREENSHOT_DIR ?? file.screenshotDir ?? 'demo/screenshots',
    skipWallet: envBool('DEMO_SKIP_WALLET', false),
    scenarios,
  }
}
