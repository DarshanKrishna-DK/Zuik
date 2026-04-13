export type TemplateCategory = 'payments' | 'trading' | 'alerts'

export interface TemplateNode {
  id: string
  type: 'generic'
  position: { x: number; y: number }
  data: { blockId: string; config: Record<string, string | number>; label: string }
}

export interface TemplateEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  tags: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedFee: string
  nodes: TemplateNode[]
  edges: TemplateEdge[]
}

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string; color: string }[] = [
  { id: 'payments', label: 'Payments', color: '#3B82F6' },
  { id: 'trading', label: 'Trading', color: '#F97316' },
  { id: 'alerts', label: 'Alerts', color: '#22C55E' },
]

const TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'dca-bot',
    name: 'DCA Bot',
    description: 'Dollar-cost average into ALGO by swapping a fixed amount of USDC at regular intervals. Reduces volatility impact over time.',
    category: 'trading',
    tags: ['DCA', 'recurring', 'ALGO', 'USDC'],
    difficulty: 'beginner',
    estimatedFee: '~0.002 ALGO/swap',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'timer-loop', config: { interval: 3600, maxIterations: '' }, label: 'Every Hour' } },
      { id: 'n2', type: 'generic', position: { x: 350, y: 100 }, data: { blockId: 'swap-token', config: { fromAsset: 31566704, toAsset: 0, amount: 5, slippage: 0.5 }, label: 'Swap 5 USDC to ALGO' } },
      { id: 'n3', type: 'generic', position: { x: 650, y: 100 }, data: { blockId: 'send-telegram', config: { message: 'DCA executed: swapped 5 USDC to ALGO' }, label: 'Notify' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'tick', targetHandle: 'in' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'result', targetHandle: 'in' },
    ],
  },
  {
    id: 'price-alert',
    name: 'Price Alert',
    description: 'Monitor ALGO/USDC price and send a Telegram alert when it drops below your threshold.',
    category: 'alerts',
    tags: ['alert', 'price', 'Telegram', 'monitor'],
    difficulty: 'beginner',
    estimatedFee: '~0 ALGO (read-only)',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'timer-loop', config: { interval: 60 }, label: 'Every Minute' } },
      { id: 'n2', type: 'generic', position: { x: 300, y: 100 }, data: { blockId: 'get-quote', config: { fromAsset: 0, toAsset: 31566704, amount: 1 }, label: 'Get ALGO Price' } },
      { id: 'n3', type: 'generic', position: { x: 550, y: 100 }, data: { blockId: 'comparator', config: { operator: '<', threshold: '0.15' }, label: 'Below 0.15?' } },
      { id: 'n4', type: 'generic', position: { x: 800, y: 100 }, data: { blockId: 'send-telegram', config: { message: 'ALGO price dropped below $0.15!' }, label: 'Alert' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'tick', targetHandle: 'in' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'quote', targetHandle: 'in' },
      { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'true', targetHandle: 'in' },
    ],
  },
  {
    id: 'treasury-split',
    name: 'Treasury Split',
    description: 'Receive a payment and automatically split it between multiple addresses - useful for DAOs, teams, or revenue sharing.',
    category: 'payments',
    tags: ['payment', 'split', 'treasury', 'DAO'],
    difficulty: 'intermediate',
    estimatedFee: '~0.003 ALGO',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 120 }, data: { blockId: 'wallet-event', config: { event: 'incoming-payment' }, label: 'On Payment Received' } },
      { id: 'n2', type: 'generic', position: { x: 350, y: 50 }, data: { blockId: 'send-payment', config: { recipient: 'REPLACE_WITH_ADDRESS_1', amount: 5, asset: 0 }, label: 'Send 50% to Partner A' } },
      { id: 'n3', type: 'generic', position: { x: 350, y: 200 }, data: { blockId: 'send-payment', config: { recipient: 'REPLACE_WITH_ADDRESS_2', amount: 5, asset: 0 }, label: 'Send 50% to Partner B' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'payment', targetHandle: 'in' },
      { id: 'e2', source: 'n1', target: 'n3', sourceHandle: 'payment', targetHandle: 'in' },
    ],
  },
  {
    id: 'asa-airdrop',
    name: 'ASA Airdrop',
    description: 'Create a new ASA token and send it to a list of recipients. Perfect for token launches or community rewards.',
    category: 'payments',
    tags: ['ASA', 'airdrop', 'token', 'create'],
    difficulty: 'intermediate',
    estimatedFee: '~0.1 ALGO (create + transfers)',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'create-asa', config: { name: 'MyToken', unit: 'MYT', total: 1000000, decimals: 6 }, label: 'Create ASA' } },
      { id: 'n2', type: 'generic', position: { x: 350, y: 100 }, data: { blockId: 'send-payment', config: { recipient: 'REPLACE_WITH_RECIPIENT', amount: 100, asset: 0 }, label: 'Send Tokens' } },
      { id: 'n3', type: 'generic', position: { x: 650, y: 100 }, data: { blockId: 'send-telegram', config: { message: 'Airdrop complete! Sent tokens to recipient.' }, label: 'Notify' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'asaId', targetHandle: 'in' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'result', targetHandle: 'in' },
    ],
  },
  {
    id: 'swap-and-notify',
    name: 'Swap & Notify',
    description: 'Perform a token swap and immediately notify you via Telegram with the result.',
    category: 'trading',
    tags: ['swap', 'Telegram', 'Tinyman', 'USDC'],
    difficulty: 'beginner',
    estimatedFee: '~0.002 ALGO',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'swap-token', config: { fromAsset: 31566704, toAsset: 0, amount: 10, slippage: 0.5 }, label: 'Swap 10 USDC to ALGO' } },
      { id: 'n2', type: 'generic', position: { x: 400, y: 100 }, data: { blockId: 'send-telegram', config: { message: 'Swap complete: 10 USDC -> ALGO' }, label: 'Telegram Alert' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'result', targetHandle: 'in' },
    ],
  },
  {
    id: 'recurring-payment',
    name: 'Recurring Payment',
    description: 'Send a fixed ALGO payment on a schedule - subscriptions, salaries, or recurring donations.',
    category: 'payments',
    tags: ['payment', 'recurring', 'salary', 'schedule'],
    difficulty: 'beginner',
    estimatedFee: '~0.001 ALGO/payment',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'timer-loop', config: { interval: 86400 }, label: 'Every Day' } },
      { id: 'n2', type: 'generic', position: { x: 350, y: 100 }, data: { blockId: 'send-payment', config: { recipient: 'REPLACE_WITH_ADDRESS', amount: 1, asset: 0 }, label: 'Send 1 ALGO' } },
      { id: 'n3', type: 'generic', position: { x: 650, y: 100 }, data: { blockId: 'browser-notify', config: { title: 'Payment Sent', message: 'Recurring payment of 1 ALGO sent.' }, label: 'Confirm' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'tick', targetHandle: 'in' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'result', targetHandle: 'in' },
    ],
  },
  {
    id: 'whale-alert',
    name: 'Whale Alert',
    description: 'Monitor your wallet for large incoming payments and get instant Telegram notifications.',
    category: 'alerts',
    tags: ['whale', 'alert', 'monitor', 'Telegram'],
    difficulty: 'intermediate',
    estimatedFee: '~0 ALGO (read-only)',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'wallet-event', config: { event: 'incoming-payment' }, label: 'On Payment' } },
      { id: 'n2', type: 'generic', position: { x: 300, y: 100 }, data: { blockId: 'comparator', config: { operator: '>', threshold: '100' }, label: 'Over 100 ALGO?' } },
      { id: 'n3', type: 'generic', position: { x: 550, y: 50 }, data: { blockId: 'send-telegram', config: { message: 'Whale alert! Large payment received (>100 ALGO)' }, label: 'Telegram Alert' } },
      { id: 'n4', type: 'generic', position: { x: 550, y: 200 }, data: { blockId: 'send-discord', config: { message: 'Whale alert! Large payment received (>100 ALGO)' }, label: 'Discord Alert' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'payment', targetHandle: 'in' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'true', targetHandle: 'in' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'true', targetHandle: 'in' },
    ],
  },
  {
    id: 'stop-loss',
    name: 'Stop-Loss Guard',
    description: 'Automatically swap ALGO to USDC when the price drops below your stop-loss level to limit losses.',
    category: 'trading',
    tags: ['stop-loss', 'protection', 'swap', 'trading'],
    difficulty: 'advanced',
    estimatedFee: '~0.002 ALGO',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'timer-loop', config: { interval: 30 }, label: 'Every 30s' } },
      { id: 'n2', type: 'generic', position: { x: 300, y: 100 }, data: { blockId: 'get-quote', config: { fromAsset: 0, toAsset: 31566704, amount: 1 }, label: 'Check ALGO Price' } },
      { id: 'n3', type: 'generic', position: { x: 550, y: 100 }, data: { blockId: 'comparator', config: { operator: '<', threshold: '0.12' }, label: 'Below Stop-Loss?' } },
      { id: 'n4', type: 'generic', position: { x: 800, y: 50 }, data: { blockId: 'swap-token', config: { fromAsset: 0, toAsset: 31566704, amount: 100, slippage: 1 }, label: 'Emergency Swap' } },
      { id: 'n5', type: 'generic', position: { x: 800, y: 200 }, data: { blockId: 'send-telegram', config: { message: 'Stop-loss triggered! Swapped ALGO to USDC at emergency price.' }, label: 'Alert' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'tick', targetHandle: 'in' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'quote', targetHandle: 'in' },
      { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'true', targetHandle: 'in' },
      { id: 'e4', source: 'n3', target: 'n5', sourceHandle: 'true', targetHandle: 'in' },
    ],
  },
  {
    id: 'fiat-onramp-swap',
    name: 'Fiat to ALGO',
    description: 'Buy crypto with fiat via Saber Money on-ramp, then automatically swap USDT to ALGO.',
    category: 'trading',
    tags: ['fiat', 'onramp', 'Saber', 'swap'],
    difficulty: 'intermediate',
    estimatedFee: '~0.002 ALGO + fiat fees',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'fiat-onramp', config: { fiatAmount: 1000, fiatCurrency: 'INR', cryptoSymbol: 'USDT' }, label: 'Buy USDT' } },
      { id: 'n2', type: 'generic', position: { x: 350, y: 100 }, data: { blockId: 'swap-token', config: { fromAsset: 312769, toAsset: 0, amount: 10, slippage: 0.5 }, label: 'Swap USDT to ALGO' } },
      { id: 'n3', type: 'generic', position: { x: 650, y: 100 }, data: { blockId: 'browser-notify', config: { title: 'Fiat to ALGO Complete', message: 'Your fiat has been converted to ALGO.' }, label: 'Done' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'result', targetHandle: 'in' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'result', targetHandle: 'in' },
    ],
  },
  {
    id: 'portfolio-rebalance',
    name: 'Portfolio Rebalance',
    description: 'Periodically check your portfolio balance and rebalance between ALGO and USDC to maintain your target allocation.',
    category: 'trading',
    tags: ['rebalance', 'portfolio', 'DCA', 'allocation'],
    difficulty: 'advanced',
    estimatedFee: '~0.002 ALGO/rebalance',
    nodes: [
      { id: 'n1', type: 'generic', position: { x: 50, y: 100 }, data: { blockId: 'timer-loop', config: { interval: 86400 }, label: 'Daily Check' } },
      { id: 'n2', type: 'generic', position: { x: 300, y: 100 }, data: { blockId: 'get-quote', config: { fromAsset: 0, toAsset: 31566704, amount: 1 }, label: 'Get ALGO Price' } },
      { id: 'n3', type: 'generic', position: { x: 550, y: 50 }, data: { blockId: 'swap-token', config: { fromAsset: 31566704, toAsset: 0, amount: 10, slippage: 0.5 }, label: 'Rebalance to ALGO' } },
      { id: 'n4', type: 'generic', position: { x: 550, y: 200 }, data: { blockId: 'send-telegram', config: { message: 'Portfolio rebalance executed - allocation adjusted.' }, label: 'Notify' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'tick', targetHandle: 'in' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'quote', targetHandle: 'in' },
      { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'result', targetHandle: 'in' },
    ],
  },
]

export function getAllTemplates(): WorkflowTemplate[] {
  return TEMPLATES
}

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export function getTemplatesByCategory(category: TemplateCategory): WorkflowTemplate[] {
  return TEMPLATES.filter((t) => t.category === category)
}

export function searchTemplates(query: string): WorkflowTemplate[] {
  if (!query.trim()) return TEMPLATES
  const q = query.toLowerCase()
  return TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q)),
  )
}
