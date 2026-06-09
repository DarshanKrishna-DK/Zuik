import type { CommandIntent } from '../commandTypes'

export interface IntentPattern {
  intent: CommandIntent
  action: string
  pattern: RegExp
  score: number
  paramExtractor?: (match: RegExpMatchArray, rawText: string) => Record<string, unknown>
}

const navigationPatterns: IntentPattern[] = [
  {
    intent: 'navigation',
    action: 'go_home',
    pattern: /\b(?:go\s+)?(?:home|landing(?:\s+page)?)\b/,
    score: 90,
  },
  {
    intent: 'navigation',
    action: 'go_builder',
    pattern: /\b(?:open|go\s+to|show|take\s+me\s+to)\s+(?:the\s+)?(?:builder|workflow\s+editor)\b/,
    score: 95,
  },
  {
    intent: 'navigation',
    action: 'go_builder',
    pattern: /\b(?:start|begin)\s+building\b/,
    score: 85,
  },
  {
    intent: 'navigation',
    action: 'go_market',
    pattern: /\b(?:open|go\s+to|show)\s+(?:the\s+)?(?:market|token\s+explorer)\b/,
    score: 95,
  },
  {
    intent: 'navigation',
    action: 'go_dashboard',
    pattern: /\b(?:open|go\s+to|show)\s+(?:my\s+)?(?:dashboard|workflows)\b/,
    score: 95,
  },
  {
    intent: 'navigation',
    action: 'go_settings',
    pattern: /\b(?:open|go\s+to|show)\s+(?:my\s+)?(?:settings|preferences)\b/,
    score: 90,
  },
  {
    intent: 'navigation',
    action: 'go_settings_section',
    pattern: /\b(?:open|go\s+to|show)\s+(?:my\s+)?(?:account|agent|guardian|risk|telegram)\s+(?:settings|section|management)\b/,
    score: 92,
    paramExtractor: (_match, rawText) => {
      const section =
        rawText.match(/\baccount\b/i) ? 'account'
        : rawText.match(/\b(?:agent|guardian|automation)\b/i) ? 'agents'
        : rawText.match(/\brisk\b/i) ? 'risk'
        : rawText.match(/\btelegram\b/i) ? 'telegram'
        : 'account'
      return { section }
    },
  },
  {
    intent: 'navigation',
    action: 'connect_wallet',
    pattern: /\bconnect(?:\s+my)?\s+wallet\b/,
    score: 95,
  },
  {
    intent: 'navigation',
    action: 'go_market_asset',
    pattern: /\bshow\s+(?:algo|algorand)\s+price\b/,
    score: 88,
    paramExtractor: () => ({ assetId: '0' }),
  },
  {
    intent: 'navigation',
    action: 'go_market_asset',
    pattern: /\bshow\s+(?:token|asset)\s+(?:id\s+)?(\d+|cg:[\w-]+)\b/,
    score: 90,
    paramExtractor: (match) => ({ assetId: match[1] }),
  },
]

const workflowPatterns: IntentPattern[] = [
  {
    intent: 'workflow',
    action: 'create_workflow',
    pattern: /\b(?:create|new|start)\s+(?:a\s+)?(?:new\s+)?workflow\b/,
    score: 92,
  },
  {
    intent: 'workflow',
    action: 'create_dca_workflow',
    pattern: /\b(?:create|build|make)\s+(?:a\s+)?dca\s+(?:strategy|workflow|bot)\b/,
    score: 95,
  },
  {
    intent: 'workflow',
    action: 'run_workflow',
    pattern: /\b(?:run|start|execute)\s+(?:my\s+)?(?:the\s+)?(?:agent|workflow|strategy|bot)\b/,
    score: 88,
    paramExtractor: (_match, rawText) => {
      const nameMatch = rawText.match(
        /\b(?:run|start|execute)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+(?:strategy|workflow|bot)\b/i,
      )
      return { workflowName: nameMatch?.[1]?.trim() ?? null }
    },
  },
  {
    intent: 'workflow',
    action: 'stop_workflow',
    pattern: /\b(?:stop|halt)\s+(?:all\s+)?(?:workflows?|agents?|strategy|bot)\b/,
    score: 92,
  },
  {
    intent: 'workflow',
    action: 'pause_workflow',
    pattern: /\bpause(?:\s+(?:the\s+)?(?:agent|workflow))?\b/,
    score: 88,
  },
  {
    intent: 'workflow',
    action: 'resume_workflow',
    pattern: /\bresume(?:\s+(?:the\s+)?(?:agent|workflow))?\b/,
    score: 88,
  },
  {
    intent: 'workflow',
    action: 'open_ai_assistant',
    pattern: /\b(?:open|toggle|show)\s+(?:the\s+)?(?:ai|assistant|chat)\b/,
    score: 85,
  },
  {
    intent: 'workflow',
    action: 'send_ai_message',
    pattern: /\b(?:ask\s+ai|tell\s+ai|ai\s+prompt)\s+(?:to\s+)?(.+)$/i,
    score: 80,
    paramExtractor: (match) => ({ message: match[1]?.trim() ?? '' }),
  },
  {
    intent: 'workflow',
    action: 'open_execution_log',
    pattern: /\b(?:open|show)\s+(?:the\s+)?execution\s+log\b/,
    score: 85,
  },
  {
    intent: 'workflow',
    action: 'clear_canvas',
    pattern: /\b(?:clear|reset)\s+(?:the\s+)?canvas\b/,
    score: 80,
  },
]

const formPatterns: IntentPattern[] = [
  {
    intent: 'form',
    action: 'set_risk_tolerance',
    pattern: /\b(?:set|change|update)\s+(?:my\s+)?(?:risk(?:\s+tolerance)?|token\s+risk)\s+(?:to\s+)?(\d+)\b/,
    score: 95,
    paramExtractor: (match) => ({ value: Number.parseInt(match[1], 10) }),
  },
  {
    intent: 'form',
    action: 'fund_agent',
    pattern: /\bfund(?:\s+my)?\s+agent(?:\s+wallet)?\s+(?:with\s+)?(\d+(?:\.\d+)?)\s*algo\b/i,
    score: 95,
    paramExtractor: (match) => ({ amount: Number.parseFloat(match[1]) }),
  },
  {
    intent: 'form',
    action: 'set_telegram_chat_id',
    pattern: /\b(?:set|update)\s+(?:my\s+)?telegram\s+(?:chat\s+)?id\s+(?:to\s+)?(-?\d+)\b/i,
    score: 90,
    paramExtractor: (match) => ({ chatId: match[1] }),
  },
  {
    intent: 'form',
    action: 'rename_workflow',
    pattern: /\b(?:rename|name)\s+(?:the\s+)?workflow\s+(?:to\s+)?["']?([^"']+)["']?$/i,
    score: 82,
    paramExtractor: (match) => ({ name: match[1]?.trim() }),
  },
]

const transactionPatterns: IntentPattern[] = [
  {
    intent: 'transaction',
    action: 'prepare_send_payment',
    pattern: /\b(?:send|pay|transfer)\s+(\d+(?:\.\d+)?)\s*algo\s+(?:to\s+)([a-z2-7]{58})\b/i,
    score: 96,
    paramExtractor: (match) => ({
      amount: Number.parseFloat(match[1]),
      recipient: match[2],
    }),
  },
  {
    intent: 'transaction',
    action: 'prepare_send_payment',
    pattern: /\b(?:send|pay|transfer)\s+(\d+(?:\.\d+)?)\s*algo\b/i,
    score: 78,
    paramExtractor: (match, rawText) => {
      const addr = rawText.match(/\b([A-Za-z2-7]{58})\b/)
      return {
        amount: Number.parseFloat(match[1]),
        recipient: addr?.[1] ?? '',
      }
    },
  },
  {
    intent: 'transaction',
    action: 'prepare_fund_agent',
    pattern: /\bfund(?:\s+my)?\s+agent(?:\s+wallet)?\s+(?:with\s+)?(\d+(?:\.\d+)?)\s*algo\b/i,
    score: 94,
    paramExtractor: (match) => ({ amount: Number.parseFloat(match[1]) }),
  },
  {
    intent: 'transaction',
    action: 'prepare_agent_payment',
    pattern: /\b(?:send|pay|transfer)\s+(\d+(?:\.\d+)?)\s*algo\s+from\s+(?:my\s+)?agent\s+(?:to\s+)([a-z2-7]{58})\b/i,
    score: 95,
    paramExtractor: (match) => ({
      amount: Number.parseFloat(match[1]),
      recipient: match[2],
    }),
  },
  {
    intent: 'transaction',
    action: 'prepare_agent_payment',
    pattern: /\b(?:send|pay)\s+(\d+(?:\.\d+)?)\s*algo\s+via\s+(?:my\s+)?agent\b/i,
    score: 82,
    paramExtractor: (match, rawText) => {
      const addr = rawText.match(/\b([A-Za-z2-7]{58})\b/)
      return {
        amount: Number.parseFloat(match[1]),
        recipient: addr?.[1] ?? '',
      }
    },
  },
]

const componentPatterns: IntentPattern[] = [
  {
    intent: 'component',
    action: 'click_testid',
    pattern: /\b(?:click|press|tap)\s+(?:the\s+)?(?:button\s+)?(?:with\s+)?(?:testid|test\s+id)\s+([\w-]+)\b/,
    score: 92,
    paramExtractor: (match) => ({ testId: match[1] }),
  },
  {
    intent: 'component',
    action: 'toggle_execution_mode',
    pattern: /\b(?:set|switch|use|toggle)\s+(?:to\s+)?(?:agent\s+wallet|agent\s+mode|agent\s+signing)\b/,
    score: 90,
    paramExtractor: () => ({ mode: 'agent' }),
  },
  {
    intent: 'component',
    action: 'toggle_execution_mode',
    pattern: /\b(?:set|switch|use|toggle)\s+(?:to\s+)?(?:user\s+mode|you\s+sign|manual\s+signing)\b/,
    score: 90,
    paramExtractor: () => ({ mode: 'user' }),
  },
  {
    intent: 'component',
    action: 'toggle_sidebar',
    pattern: /\b(?:expand|open|show)\s+(?:the\s+)?(?:block\s+)?sidebar\b/,
    score: 85,
    paramExtractor: () => ({ expand: true }),
  },
  {
    intent: 'component',
    action: 'toggle_sidebar',
    pattern: /\b(?:collapse|close|hide)\s+(?:the\s+)?(?:block\s+)?sidebar\b/,
    score: 85,
    paramExtractor: () => ({ expand: false }),
  },
  {
    intent: 'component',
    action: 'open_templates',
    pattern: /\b(?:open|show)\s+(?:the\s+)?templates?\b/,
    score: 82,
  },
]

const queryPatterns: IntentPattern[] = [
  {
    intent: 'query',
    action: 'wallet_balance',
    pattern: /\b(?:what(?:'s| is)|show|check)\s+(?:my\s+)?(?:wallet\s+)?balance\b/,
    score: 95,
  },
  {
    intent: 'query',
    action: 'wallet_balance',
    pattern: /\bhow\s+much\s+algo\s+do\s+i\s+have\b/,
    score: 90,
  },
  {
    intent: 'query',
    action: 'execution_history',
    pattern: /\b(?:show|view|open)\s+(?:my\s+)?(?:execution\s+history|recent\s+executions|run\s+history)\b/,
    score: 92,
  },
  {
    intent: 'query',
    action: 'dashboard_stats',
    pattern: /\b(?:show|what\s+are)\s+(?:my\s+)?(?:dashboard\s+)?stats\b/,
    score: 88,
  },
  {
    intent: 'query',
    action: 'current_page',
    pattern: /\b(?:where\s+am\s+i|what\s+page\s+am\s+i\s+on|current\s+page)\b/,
    score: 90,
  },
  {
    intent: 'query',
    action: 'risk_tolerance',
    pattern: /\b(?:what(?:'s| is)|show)\s+(?:my\s+)?(?:risk\s+tolerance|token\s+risk)\b/,
    score: 90,
  },
  {
    intent: 'query',
    action: 'help',
    pattern: /\b(?:help|what\s+can\s+you\s+do|what\s+can\s+i\s+say)\b/,
    score: 85,
  },
]

export const ALL_INTENT_PATTERNS: IntentPattern[] = [
  ...transactionPatterns,
  ...formPatterns,
  ...workflowPatterns,
  ...navigationPatterns,
  ...componentPatterns,
  ...queryPatterns,
]
