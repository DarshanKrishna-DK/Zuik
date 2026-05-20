#!/usr/bin/env node
import { loadDemoConfig } from './src/config.js'
import { runDemo } from './src/runner.js'
import { aiWorkflowDemo } from './src/demos/ai-workflow.js'
import { aiEditDemo } from './src/demos/ai-edit.js'
import { guardianDemo } from './src/demos/guardian.js'
import { logicSigDemo } from './src/demos/logicsig.js'
import { tradingDemo } from './src/demos/trading.js'
import { fullDemo } from './src/demos/full.js'

const DEMOS = {
  'ai-workflow': {
    title: 'Step 1 - AI Workflow (wallet trigger)',
    fn: aiWorkflowDemo,
  },
  'ai-edit': {
    title: 'Step 2 - AI Workflow Edit (multi-agent)',
    fn: aiEditDemo,
  },
  guardian: {
    title: 'Step 3 - Guardian Smart Contract Limits',
    fn: guardianDemo,
  },
  logicsig: {
    title: 'Step 4 - LogicSig Delegation Setup',
    fn: logicSigDemo,
  },
  trading: {
    title: 'Market Explorer to Trading Workflow',
    fn: tradingDemo,
  },
  full: {
    title: 'Complete Story Demo (all steps)',
    fn: fullDemo,
  },
} as const

type DemoKey = keyof typeof DEMOS

function printUsage(): void {
  console.log(`
Zuik stakeholder demo automation

Usage:
  npm run demo:<name>

Story flow (run in order for a cohesive narrative):
  demo:ai-workflow   Step 1 - AI generates a simple wallet-trigger workflow
  demo:ai-edit       Step 2 - AI extends to multi-agent / multi-trigger flow
  demo:guardian      Step 3 - On-chain Guardian spend limits (Settings)
  demo:logicsig      Step 4 - LogicSig automation permissions (Settings)
  demo:full          All four chapters plus landing and dashboard

Optional:
  demo:trading       Market explorer to prefilled swap workflow

Environment:
  DEMO_BASE_URL          App URL (default http://localhost:5173)
  DEMO_START_SERVER      Start Vite if not running (default true)
  DEMO_HEADLESS          Run headless (default false)
  DEMO_SKIP_WALLET       Skip wallet wait (UI-only)
  DEMO_WALLET_PROVIDER   kmd | pera
  DEMO_WALLET_WAIT_MS    Wallet connect timeout
  DEMO_AI_INTENT         Override Step 1 AI prompt
  DEMO_AI_EDIT_INTENT    Override Step 2 AI edit prompt

Config file (optional):
  Copy demo/demo.config.example.json to demo/demo.config.json
`)
}

async function main(): Promise<void> {
  const arg = process.argv[2] as DemoKey | undefined
  if (!arg || arg === 'help' || arg === '--help') {
    printUsage()
    process.exit(arg ? 0 : 1)
  }

  const entry = DEMOS[arg]
  if (!entry) {
    console.error(`Unknown demo: ${arg}`)
    printUsage()
    process.exit(1)
  }

  const config = loadDemoConfig()
  await runDemo(entry.title, entry.fn, config)
}

main()
