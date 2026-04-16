import {
  Timer, Webhook, Wallet, MessageSquare,
  ArrowLeftRight, Send, PlusCircle, FileCode, Hexagon,
  GitBranch, Clock, Calculator, Filter, Gauge, Variable,
  MessageCircle, Bell,
  TrendingDown, Droplets, PieChart,
  Hash, Merge, RefreshCw, Globe, Search, Bug,
  Banknote, Landmark, BadgeDollarSign,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type PortType = 'any' | 'token' | 'number' | 'address' | 'boolean' | 'string' | 'object'

export interface Port {
  id: string
  label: string
  type: PortType
}

export type BlockCategory = 'trigger' | 'action' | 'logic' | 'notification' | 'defi'

export interface ConfigField {
  id: string
  label: string
  type: 'text' | 'number' | 'select' | 'token' | 'address' | 'textarea' | 'slider' | 'password'
  placeholder?: string
  options?: { value: string; label: string; description?: string }[]
  defaultValue?: string | number
  min?: number
  max?: number
  step?: number
}

export interface BlockDefinition {
  id: string
  name: string
  description: string
  category: BlockCategory
  icon: LucideIcon
  inputs: Port[]
  outputs: Port[]
  config: ConfigField[]
}

export const CATEGORY_META: Record<BlockCategory, { label: string; colorClass: string; bgClass: string }> = {
  trigger:      { label: 'Triggers',      colorClass: 'cat-trigger',      bgClass: 'cat-trigger-bg' },
  action:       { label: 'Actions',       colorClass: 'cat-action',       bgClass: 'cat-action-bg' },
  logic:        { label: 'Logic',         colorClass: 'cat-logic',        bgClass: 'cat-logic-bg' },
  notification: { label: 'Notifications', colorClass: 'cat-notification', bgClass: 'cat-notification-bg' },
  defi:         { label: 'DeFi',          colorClass: 'cat-defi',         bgClass: 'cat-defi-bg' },
}

export const PORT_COLORS: Record<PortType, string> = {
  any:     '#71717A',
  token:   '#22C55E',
  number:  '#3B82F6',
  address: '#F97316',
  boolean: '#EAB308',
  string:  '#A855F7',
  object:  '#EC4899',
}

const blocks: BlockDefinition[] = [
  // ─── Triggers ──────────────────────────────────
  {
    id: 'timer-loop',
    name: 'Timer Loop',
    description: 'Repeats an action on a schedule - e.g. check prices every 60 seconds or buy tokens every hour',
    category: 'trigger',
    icon: Timer,
    inputs: [],
    outputs: [{ id: 'tick', label: 'On Tick', type: 'object' }],
    config: [
      { id: 'interval', label: 'Interval (sec)', type: 'number', defaultValue: 60 },
      { id: 'maxIterations', label: 'Max Iterations', type: 'number', placeholder: '∞' },
    ],
  },
  {
    id: 'webhook-receiver',
    name: 'Webhook Receiver',
    description: 'Starts your workflow when an external service sends a signal - useful for connecting to other apps or bots',
    category: 'trigger',
    icon: Webhook,
    inputs: [],
    outputs: [{ id: 'payload', label: 'Payload', type: 'object' }],
    config: [
      { id: 'path', label: 'Webhook Path', type: 'text', placeholder: '/hook/my-trigger' },
    ],
  },
  {
    id: 'wallet-event',
    name: 'Wallet Event',
    description:
      'Watches your wallet on a timer. When the chain advances a round, the agent runs your workflow. ' +
      'For {{wallet-event.amount}}, use "Net received" (default): the change in this asset since the last poll (approximates what you just received). ' +
      'Use "Total balance" only if you intend to swap your whole balance (not typical for "when I receive" flows).',
    category: 'trigger',
    icon: Wallet,
    inputs: [],
    outputs: [
      { id: 'txn', label: 'Transaction', type: 'object' },
      { id: 'amount', label: 'Amount', type: 'number' },
    ],
    config: [
      { id: 'address', label: 'Watch Address', type: 'address' },
      { id: 'assetId', label: 'Asset ID (0 = ALGO)', type: 'number', defaultValue: 0 },
      { id: 'pollInterval', label: 'Poll Interval (sec)', type: 'number', defaultValue: 15 },
      {
        id: 'amountMode',
        label: '{{wallet-event.amount}} means',
        type: 'select',
        defaultValue: 'received',
        options: [
          { value: 'received', label: 'Net received since last check (recommended)' },
          { value: 'total', label: 'Total balance (swap everything)' },
        ],
      },
    ],
  },
  {
    id: 'telegram-trigger',
    name: 'Telegram Message',
    description: 'Starts your workflow when someone sends a message to your Telegram bot - control trades via chat',
    category: 'trigger',
    icon: MessageSquare,
    inputs: [],
    outputs: [
      { id: 'message', label: 'Message', type: 'string' },
      { id: 'chatId', label: 'Chat ID', type: 'string' },
    ],
    config: [
      { id: 'chatId', label: 'Chat ID Filter', type: 'text', placeholder: 'Any chat' },
      { id: 'pattern', label: 'Message Pattern', type: 'text', placeholder: 'regex or text' },
    ],
  },

  // ─── Actions ───────────────────────────────────
  {
    id: 'swap-token',
    name: 'Swap Token',
    description: 'Exchange one token for another - e.g. convert your USDC into ALGO at the best available rate',
    category: 'action',
    icon: ArrowLeftRight,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'txId', label: 'Tx ID', type: 'string' },
      { id: 'amountOut', label: 'Amount Out', type: 'number' },
    ],
    config: [
      { id: 'fromAsset', label: 'From Asset', type: 'token' },
      { id: 'toAsset', label: 'To Asset', type: 'token' },
      { id: 'amount', label: 'Amount', type: 'number' },
      { id: 'slippage', label: 'Slippage %', type: 'number', defaultValue: 0.5 },
    ],
  },
  {
    id: 'send-payment',
    name: 'Send Payment',
    description: 'Send ALGO or any token to an address',
    category: 'action',
    icon: Send,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'txId', label: 'Tx ID', type: 'string' }],
    config: [
      { id: 'recipient', label: 'Recipient', type: 'address' },
      { id: 'amount', label: 'Amount', type: 'number' },
      { id: 'asset', label: 'Asset', type: 'token' },
      { id: 'note', label: 'Note', type: 'text', placeholder: 'Optional tx note' },
    ],
  },
  {
    id: 'opt-in-asa',
    name: 'Opt-In Token',
    description: 'Enable a token in your wallet so you can receive it',
    category: 'action',
    icon: PlusCircle,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'txId', label: 'Tx ID', type: 'string' }],
    config: [
      { id: 'assetId', label: 'Asset ID', type: 'token' },
    ],
  },
  {
    id: 'create-asa',
    name: 'Create Token',
    description: 'Create a new custom token on Algorand',
    category: 'action',
    icon: Hexagon,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'txId', label: 'Tx ID', type: 'string' },
      { id: 'assetId', label: 'Asset ID', type: 'number' },
    ],
    config: [
      { id: 'name', label: 'Asset Name', type: 'text' },
      { id: 'unitName', label: 'Unit Name', type: 'text' },
      { id: 'totalSupply', label: 'Total Supply', type: 'number' },
      { id: 'decimals', label: 'Decimals', type: 'number', defaultValue: 6 },
    ],
  },
  {
    id: 'call-contract',
    name: 'Call Smart Contract',
    description: 'Interact with a smart contract on Algorand - for advanced users who want to call on-chain programs',
    category: 'action',
    icon: FileCode,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'txId', label: 'Tx ID', type: 'string' },
      { id: 'returnValue', label: 'Return Value', type: 'any' },
    ],
    config: [
      { id: 'appId', label: 'App ID', type: 'number' },
      { id: 'method', label: 'Method Name', type: 'text' },
      { id: 'args', label: 'Arguments (JSON)', type: 'textarea', placeholder: '["arg1", 42]' },
    ],
  },

  // ─── Logic ─────────────────────────────────────
  {
    id: 'comparator',
    name: 'Comparator',
    description: 'Makes decisions in your workflow - e.g. only swap if the price is below a target, otherwise skip',
    category: 'logic',
    icon: GitBranch,
    inputs: [{ id: 'value', label: 'Value', type: 'any' }],
    outputs: [
      { id: 'true', label: 'True', type: 'any' },
      { id: 'false', label: 'False', type: 'any' },
    ],
    config: [
      { id: 'operator', label: 'Operator', type: 'select', options: [
        { value: '>', label: '>' }, { value: '<', label: '<' },
        { value: '==', label: '==' }, { value: '!=', label: '!=' },
        { value: '>=', label: '>=' }, { value: '<=', label: '<=' },
        { value: 'contains', label: 'contains' },
      ]},
      { id: 'threshold', label: 'Compare To', type: 'text' },
    ],
  },
  {
    id: 'delay',
    name: 'Delay',
    description: 'Adds a waiting period between steps - e.g. wait 30 seconds before checking the price again',
    category: 'logic',
    icon: Clock,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Output', type: 'any' }],
    config: [
      { id: 'duration', label: 'Duration (sec)', type: 'number', defaultValue: 5 },
    ],
  },
  {
    id: 'math-op',
    name: 'Math Operation',
    description: 'Does calculations - e.g. compute 50% of a received amount, add fees, or calculate a fraction',
    category: 'logic',
    icon: Calculator,
    inputs: [
      { id: 'a', label: 'A (or upstream value)', type: 'number' },
      { id: 'b', label: 'B', type: 'number' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }],
    config: [
      { id: 'operation', label: 'Operation', type: 'select', options: [
        { value: 'add', label: 'Add (+)' }, { value: 'subtract', label: 'Subtract (-)' },
        { value: 'percentage', label: 'Percentage (%)' },
        { value: 'multiply', label: 'Multiply (×)' }, { value: 'divide', label: 'Divide (÷)' },
        { value: 'modulo', label: 'Modulo (%)' },
      ]},
    ],
  },
  {
    id: 'filter',
    name: 'Filter',
    description: 'Acts as a gate - only lets data through if a condition is met, like amount > 100',
    category: 'logic',
    icon: Filter,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'passed', label: 'Passed', type: 'any' }],
    config: [
      { id: 'field', label: 'Field Path', type: 'text', placeholder: 'e.g. amount' },
      { id: 'operator', label: 'Operator', type: 'select', options: [
        { value: '>', label: '>' }, { value: '<', label: '<' },
        { value: '==', label: '==' }, { value: '!=', label: '!=' },
      ]},
      { id: 'value', label: 'Value', type: 'text' },
    ],
  },
  {
    id: 'rate-limiter',
    name: 'Rate Limiter',
    description: 'Prevents actions from running too often - e.g. max 5 swaps per minute to avoid spam',
    category: 'logic',
    icon: Gauge,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Output', type: 'any' }],
    config: [
      { id: 'maxPerWindow', label: 'Max Executions', type: 'number', defaultValue: 5 },
      { id: 'windowSec', label: 'Time Window (sec)', type: 'number', defaultValue: 60 },
    ],
  },
  {
    id: 'variable-set',
    name: 'Set Variable',
    description: 'Saves a value (like a price or amount) so other blocks in the workflow can use it later',
    category: 'logic',
    icon: Variable,
    inputs: [{ id: 'value', label: 'Value', type: 'any' }],
    outputs: [{ id: 'stored', label: 'Stored', type: 'any' }],
    config: [
      { id: 'varName', label: 'Variable Name', type: 'text' },
    ],
  },

  // ─── Notifications ─────────────────────────────
  {
    id: 'send-telegram',
    name: 'Send Telegram',
    description: 'Sends you a Telegram notification - e.g. alert when a swap completes or a price target is hit',
    category: 'notification',
    icon: MessageSquare,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'sent', label: 'Sent', type: 'boolean' }],
    config: [
      { id: 'chatId', label: 'Chat ID', type: 'text' },
      { id: 'message', label: 'Message', type: 'textarea', placeholder: 'Supports {{variable}} interpolation' },
    ],
  },
  {
    id: 'send-discord',
    name: 'Send Discord',
    description: 'Posts a message to your Discord server channel - great for team alerts or trade notifications',
    category: 'notification',
    icon: MessageCircle,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'sent', label: 'Sent', type: 'boolean' }],
    config: [
      { id: 'webhookUrl', label: 'Webhook URL', type: 'text' },
      { id: 'message', label: 'Message', type: 'textarea' },
    ],
  },
  {
    id: 'browser-notify',
    name: 'Browser Notification',
    description: 'Shows a pop-up notification on your computer screen when something important happens',
    category: 'notification',
    icon: Bell,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'shown', label: 'Shown', type: 'boolean' }],
    config: [
      { id: 'title', label: 'Title', type: 'text' },
      { id: 'body', label: 'Body', type: 'text' },
    ],
  },

  // ─── DeFi ──────────────────────────────────────
  {
    id: 'price-monitor',
    name: 'Price Monitor',
    description: 'Watch a token price via DEX pools',
    category: 'defi',
    icon: TrendingDown,
    inputs: [],
    outputs: [
      { id: 'price', label: 'Price', type: 'number' },
      { id: 'change', label: 'Change %', type: 'number' },
    ],
    config: [
      { id: 'assetId', label: 'Asset ID', type: 'token' },
      { id: 'pollInterval', label: 'Poll (sec)', type: 'number', defaultValue: 30 },
    ],
  },
  {
    id: 'pool-info',
    name: 'Liquidity Pool Info',
    description: 'Checks how much liquidity a trading pair has - helps you know if a swap will have good rates',
    category: 'defi',
    icon: Droplets,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'reserve1', label: 'Reserve 1', type: 'number' },
      { id: 'reserve2', label: 'Reserve 2', type: 'number' },
    ],
    config: [
      { id: 'asset1', label: 'Asset 1', type: 'token' },
      { id: 'asset2', label: 'Asset 2', type: 'token' },
    ],
  },
  {
    id: 'portfolio-balance',
    name: 'Portfolio Balance',
    description: 'Shows all your token holdings and their balances - see your full portfolio at a glance',
    category: 'defi',
    icon: PieChart,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'balances', label: 'Balances', type: 'object' }],
    config: [
      { id: 'address', label: 'Address', type: 'address' },
    ],
  },
  {
    id: 'get-quote',
    name: 'Get Swap Quote',
    description: 'Checks how much you would receive from a swap without actually doing it - preview before you trade',
    category: 'defi',
    icon: Search,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'quoteAmount', label: 'Quote Amount', type: 'number' },
      { id: 'priceImpact', label: 'Price Impact %', type: 'number' },
    ],
    config: [
      { id: 'fromAsset', label: 'From Asset', type: 'token' },
      { id: 'toAsset', label: 'To Asset', type: 'token' },
      { id: 'amount', label: 'Amount', type: 'number' },
      { id: 'slippage', label: 'Slippage %', type: 'slider', defaultValue: 0.5, min: 0.1, max: 5, step: 0.1 },
    ],
  },

  // ─── Additional Logic Blocks ─────────────────
  {
    id: 'constant',
    name: 'Constant',
    description: 'Provides a fixed value (like a number or text) that other blocks can use as input',
    category: 'logic',
    icon: Hash,
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: 'any' }],
    config: [
      { id: 'value', label: 'Value', type: 'text' },
      { id: 'type', label: 'Data Type', type: 'select', options: [
        { value: 'string', label: 'String' },
        { value: 'number', label: 'Number' },
        { value: 'boolean', label: 'Boolean' },
        { value: 'json', label: 'JSON' },
      ]},
    ],
  },
  {
    id: 'merge',
    name: 'Merge',
    description: 'Combines data from multiple blocks into one - useful when you need results from different sources together',
    category: 'logic',
    icon: Merge,
    inputs: [
      { id: 'input1', label: 'Input 1', type: 'any' },
      { id: 'input2', label: 'Input 2', type: 'any' },
    ],
    outputs: [{ id: 'merged', label: 'Merged', type: 'any' }],
    config: [
      { id: 'mode', label: 'Merge Mode', type: 'select', options: [
        { value: 'first', label: 'First non-empty' },
        { value: 'concat', label: 'Concatenate' },
        { value: 'object', label: 'Merge objects' },
      ]},
    ],
  },
  {
    id: 'transform-data',
    name: 'Transform Data',
    description: 'Converts data from one format to another - e.g. turn text into a number for calculations',
    category: 'logic',
    icon: RefreshCw,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Output', type: 'any' }],
    config: [
      { id: 'targetType', label: 'Convert To', type: 'select', options: [
        { value: 'number', label: 'Number' },
        { value: 'string', label: 'String' },
        { value: 'boolean', label: 'Boolean' },
        { value: 'json', label: 'JSON parse' },
      ]},
    ],
  },

  // ─── Additional Action Blocks ────────────────
  {
    id: 'webhook-action',
    name: 'HTTP Request',
    description: 'Calls any web API or service - fetch price data, trigger external tools, or connect to other platforms',
    category: 'action',
    icon: Globe,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'response', label: 'Response', type: 'object' },
      { id: 'status', label: 'Status', type: 'number' },
    ],
    config: [
      { id: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/data' },
      { id: 'method', label: 'Method', type: 'select', options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
        { value: 'DELETE', label: 'DELETE' },
      ], defaultValue: 'GET' },
      { id: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
      { id: 'body', label: 'Body (JSON)', type: 'textarea', placeholder: '{"key": "value"}' },
    ],
  },
  {
    id: 'log-debug',
    name: 'Log / Debug',
    description: 'Records values in the execution log - useful for debugging and seeing what is happening in your workflow',
    category: 'action',
    icon: Bug,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'passthrough', label: 'Passthrough', type: 'any' }],
    config: [
      { id: 'label', label: 'Label', type: 'text', placeholder: 'Debug output' },
    ],
  },

  // ─── Saber Money - Fiat ↔ Crypto ─────────────
  {
    id: 'fiat-onramp',
    name: 'Fiat On-Ramp',
    description: 'Buy crypto using your local currency (INR, USD, EUR) - converts your money into tokens via Saber Money',
    category: 'action',
    icon: Banknote,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'widgetUrl', label: 'Widget URL', type: 'string' },
      { id: 'transactionId', label: 'Transaction ID', type: 'string' },
    ],
    config: [
      { id: 'userId', label: 'Saber User ID', type: 'text', placeholder: 'UUID from Saber user creation' },
      { id: 'walletAddress', label: 'Wallet Address', type: 'address' },
      { id: 'fiatAmount', label: 'Fiat Amount', type: 'number' },
      { id: 'fiatCurrency', label: 'Fiat Currency', type: 'select', options: [
        { value: 'INR', label: 'INR - Indian Rupee' },
        { value: 'USD', label: 'USD - US Dollar' },
        { value: 'EUR', label: 'EUR - Euro' },
        { value: 'GBP', label: 'GBP - British Pound' },
        { value: 'AED', label: 'AED - UAE Dirham' },
      ], defaultValue: 'INR' },
      { id: 'cryptoSymbol', label: 'Crypto Token', type: 'select', options: [
        { value: 'USDT', label: 'USDT' },
        { value: 'USDC', label: 'USDC' },
      ], defaultValue: 'USDT' },
      { id: 'network', label: 'Network', type: 'select', options: [
        { value: 'ALGORAND', label: 'Algorand' },
        { value: 'MATIC', label: 'Polygon' },
        { value: 'BSC', label: 'BSC' },
        { value: 'ETH', label: 'Ethereum' },
      ], defaultValue: 'ALGORAND' },
    ],
  },
  {
    id: 'fiat-offramp',
    name: 'Fiat Off-Ramp',
    description: 'Cash out your crypto to your bank account - converts tokens back to your local currency',
    category: 'action',
    icon: Landmark,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'transactionId', label: 'Transaction ID', type: 'string' },
      { id: 'status', label: 'Status', type: 'string' },
      { id: 'exchangeRate', label: 'Exchange Rate', type: 'number' },
    ],
    config: [
      { id: 'userId', label: 'Saber User ID', type: 'text', placeholder: 'UUID from Saber user creation' },
      { id: 'sourceId', label: 'Bank Source ID', type: 'text', placeholder: 'Linked bank account UUID' },
      { id: 'fiatAmount', label: 'Fiat Amount', type: 'number' },
      { id: 'fiatCurrency', label: 'Fiat Currency', type: 'select', options: [
        { value: 'INR', label: 'INR - Indian Rupee' },
        { value: 'USD', label: 'USD - US Dollar' },
        { value: 'EUR', label: 'EUR - Euro' },
        { value: 'GBP', label: 'GBP - British Pound' },
      ], defaultValue: 'INR' },
      { id: 'cryptoSymbol', label: 'Crypto Token', type: 'select', options: [
        { value: 'USDT', label: 'USDT' },
        { value: 'USDC', label: 'USDC' },
      ], defaultValue: 'USDT' },
      { id: 'paymentMethod', label: 'Payment Method', type: 'select', options: [
        { value: 'bank_transfer', label: 'Bank Transfer' },
        { value: 'upi_transfer', label: 'UPI Transfer', description: 'India only' },
      ], defaultValue: 'bank_transfer' },
    ],
  },
  {
    id: 'fiat-quote',
    name: 'Fiat Price Quote',
    description: 'Check live exchange rates between your currency and crypto before buying or selling',
    category: 'defi',
    icon: BadgeDollarSign,
    inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    outputs: [
      { id: 'fromAmount', label: 'Fiat Amount', type: 'number' },
      { id: 'toAmount', label: 'Crypto Amount', type: 'number' },
      { id: 'exchangeRate', label: 'Exchange Rate', type: 'number' },
      { id: 'totalFee', label: 'Total Fee', type: 'number' },
    ],
    config: [
      { id: 'userId', label: 'Saber User ID', type: 'text', placeholder: 'UUID from Saber user creation' },
      { id: 'fromCurrency', label: 'Fiat Currency', type: 'select', options: [
        { value: 'INR', label: 'INR' },
        { value: 'USD', label: 'USD' },
        { value: 'EUR', label: 'EUR' },
        { value: 'GBP', label: 'GBP' },
      ], defaultValue: 'INR' },
      { id: 'toCurrency', label: 'Crypto Token', type: 'select', options: [
        { value: 'USDT', label: 'USDT' },
        { value: 'USDC', label: 'USDC' },
      ], defaultValue: 'USDT' },
      { id: 'amount', label: 'Fiat Amount', type: 'number' },
      { id: 'network', label: 'Network', type: 'select', options: [
        { value: 'ALGORAND', label: 'Algorand' },
        { value: 'MATIC', label: 'Polygon' },
        { value: 'BSC', label: 'BSC' },
      ], defaultValue: 'ALGORAND' },
    ],
  },
]

export function getBlocksByCategory(): Record<BlockCategory, BlockDefinition[]> {
  const grouped: Record<BlockCategory, BlockDefinition[]> = {
    trigger: [], action: [], logic: [], notification: [], defi: [],
  }
  for (const b of blocks) {
    grouped[b.category].push(b)
  }
  return grouped
}

export function getBlockById(id: string): BlockDefinition | undefined {
  return blocks.find(b => b.id === id)
}

export function getAllBlocks(): BlockDefinition[] {
  return blocks
}

export default blocks
