import type { SupabaseClient } from '@supabase/supabase-js'
import { sendTelegram, fetchPrice, executeWorkflowHeadless } from './agent.js'
import { buildWorkflowFromText } from './workflowIntentGroq.js'
import { workflowNeedsZuikApp } from './flowSigner.js'

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const ZUIK_APP_URL = (process.env.ZUIK_APP_URL ?? 'https://zuik.vercel.app').replace(/\/$/, '')
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

let lastUpdateId = 0
let supabase: SupabaseClient
let useWebhook = process.env.TELEGRAM_WEBHOOK_URL ? true : false

// ── Telegram API helpers ────────────────────────────────

interface TelegramUpdate {
  update_id: number
  message?: {
    chat: { id: number }
    from?: { first_name?: string; username?: string }
    text?: string
  }
  callback_query?: {
    id: string
    from: { id: number; first_name?: string }
    message?: { chat: { id: number } }
    data?: string
  }
}

async function getUpdates(): Promise<TelegramUpdate[]> {
  if (!TELEGRAM_TOKEN) return []
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5&allowed_updates=["message","callback_query"]`,
    )
    if (!res.ok) return []
    const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] }
    return data.ok ? data.result : []
  } catch {
    return []
  }
}

async function sendReply(chatId: number, text: string) {
  await sendTelegram(String(chatId), text)
}

async function setBotCommands() {
  if (!TELEGRAM_TOKEN) return
  const commands = [
    { command: 'start', description: 'Start the bot and register' },
    { command: 'link', description: 'Link your Algorand wallet' },
    { command: 'unlink', description: 'Unlink your wallet' },
    { command: 'balance', description: 'Check wallet ALGO balance' },
    { command: 'price', description: 'Live ALGO/USD price' },
    { command: 'workflows', description: 'List your saved workflows' },
    { command: 'workflow_build', description: 'Describe a workflow to save it' },
    { command: 'run_workflow', description: 'Pick a workflow to run' },
    { command: 'status', description: 'Active workflow schedules' },
    { command: 'profit', description: 'Execution history and stats' },
    { command: 'commands', description: 'Show all commands with buttons' },
    { command: 'options', description: 'Show quick action buttons' },
    { command: 'help', description: 'Welcome message' },
  ]

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }),
    })
    console.log('[Telegram] Bot commands registered')
  } catch (e) {
    console.warn('[Telegram] Failed to set commands:', e)
  }
}

// ── Command handlers ────────────────────────────────────

async function sendWithButtons(chatId: number, text: string, buttons: { text: string; callback_data?: string; url?: string }[][]) {
  if (!TELEGRAM_TOKEN) return
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    }),
  })
}

async function handleStart(chatId: number, firstName?: string, _username?: string) {
  try {
    const chatIdStr = String(chatId)
    const { data: existing } = await supabase
      .from('telegram_links')
      .select('id')
      .eq('telegram_chat_id', chatIdStr)
      .maybeSingle()

    if (!existing) {
      await supabase
        .from('telegram_links')
        .insert({
          telegram_chat_id: chatIdStr,
          wallet_address: '',
        })
    }
    console.log(`[Telegram] Auto-registered chat ${chatId} (${firstName})`)
  } catch (e) {
    console.warn('[Telegram] Auto-register failed:', e)
  }

  const greeting = firstName ? `Hey ${firstName}!` : 'Hey!'

  await sendWithButtons(chatId, [
    `${greeting} Welcome to <b>Zuik</b>`,
    '',
    'Your DeFi automation assistant on Algorand.',
    '',
    `Your Chat ID: <code>${chatId}</code>`,
    'Copy this into Zuik Settings to receive notifications.',
    '',
    'Tap a button below to get started.',
  ].join('\n'), [
    [
      { text: 'Link Wallet', callback_data: 'action_link' },
      { text: 'Check Balance', callback_data: 'action_balance' },
    ],
    [
      { text: 'ALGO Price', callback_data: 'action_price' },
      { text: 'My Workflows', callback_data: 'action_workflows' },
    ],
    [
      { text: 'All Commands', callback_data: 'action_commands' },
      { text: 'Open Web App', url: 'https://zuik.vercel.app' },
    ],
  ])
}

async function handleCommands(chatId: number) {
  await sendWithButtons(chatId, [
    '<b>Zuik Commands</b>',
    '',
    '/link &lt;address&gt; - Link Algorand wallet',
    '/unlink - Disconnect wallet',
    '/balance - Wallet balance (ALGO + INR)',
    '/price - Live ALGO price',
    '/workflows - Your saved workflows',
    '/workflow_build &lt;description&gt; - AI saves a workflow to your account',
    '/run_workflow - Pick a workflow (server runs alerts only; swaps open in the app)',
    '/status - Active schedules',
    '/profit - Execution history',
    '/commands - This command list',
    '',
    'Or just type any question about DeFi!',
  ].join('\n'), [
    [
      { text: 'Link Wallet', callback_data: 'action_link' },
      { text: 'Check Balance', callback_data: 'action_balance' },
    ],
    [
      { text: 'ALGO Price', callback_data: 'action_price' },
      { text: 'Execution History', callback_data: 'action_profit' },
    ],
  ])
}

async function handleLink(chatId: number, walletAddress: string) {
  if (!walletAddress || walletAddress.length !== 58) {
    await sendReply(chatId, 'Please provide a valid 58-character Algorand wallet address.\n\nUsage: /link YOUR_WALLET_ADDRESS')
    return
  }

  const chatIdStr = String(chatId)

  const { data: existing } = await supabase
    .from('telegram_links')
    .select('id')
    .eq('telegram_chat_id', chatIdStr)
    .maybeSingle()

  let error: { message: string } | null = null
  if (existing) {
    const result = await supabase
      .from('telegram_links')
      .update({ wallet_address: walletAddress })
      .eq('id', (existing as { id: string }).id)
    error = result.error
  } else {
    const result = await supabase
      .from('telegram_links')
      .insert({
        wallet_address: walletAddress,
        telegram_chat_id: chatIdStr,
      })
    error = result.error
  }

  if (error) {
    console.error('[Telegram] Link error:', error.message)
    await sendReply(chatId, `Link failed: ${error.message}\nPlease try again or contact support.`)
    return
  }

  const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
  await sendReply(chatId, `Wallet linked! <code>${shortAddr}</code>\n\nYou will now receive notifications from your Zuik workflows. Try /balance to check your wallet.`)
}

async function handleUnlink(chatId: number) {
  const { error } = await supabase
    .from('telegram_links')
    .update({ wallet_address: null })
    .eq('telegram_chat_id', String(chatId))

  if (error) {
    console.error('[Telegram] Unlink error:', error.message)
    await sendReply(chatId, 'Failed to unlink wallet. Please try again.')
    return
  }

  await sendReply(chatId, 'Wallet unlinked. Use /link YOUR_WALLET_ADDRESS to connect a different wallet.')
}

async function handleWorkflows(chatId: number) {
  const walletAddress = await getWalletForChat(chatId)
  if (!walletAddress) {
    await sendReply(chatId, 'No wallet linked. Use /link YOUR_WALLET_ADDRESS first.')
    return
  }

  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, name, is_active, updated_at')
    .eq('wallet_address', walletAddress)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error || !workflows || workflows.length === 0) {
    await sendReply(chatId, 'No workflows found. Create workflows in the Zuik web builder!')
    return
  }

  const lines = workflows.map((w: { id: string; name: string; is_active: boolean }, i: number) => {
    const status = w.is_active ? 'Active' : 'Paused'
    return `${i + 1}. [${status}] <b>${w.name}</b>`
  })

  await sendReply(chatId, `<b>Your Workflows:</b>\n\n${lines.join('\n')}\n\nManage workflows at the Zuik web app.`)
}

async function handleStatus(chatId: number) {
  const walletAddress = await getWalletForChat(chatId)
  if (!walletAddress) {
    await sendReply(chatId, 'No wallet linked. Use /link YOUR_WALLET_ADDRESS first.')
    return
  }

  const { data: schedules } = await supabase
    .from('workflow_schedules')
    .select('id, workflow_id, interval_sec, iterations_completed, max_iterations, next_run_at, is_active')
    .eq('wallet_address', walletAddress)
    .eq('is_active', true)
    .order('next_run_at', { ascending: true })

  if (!schedules || schedules.length === 0) {
    await sendReply(chatId, 'No active schedules. Start a workflow with a Timer trigger in the builder.')
    return
  }

  const lines = schedules.map((s: { interval_sec: number; iterations_completed: number; max_iterations: number | null; next_run_at: string }) => {
    const interval = s.interval_sec >= 3600 ? `${Math.round(s.interval_sec / 3600)}h`
      : s.interval_sec >= 60 ? `${Math.round(s.interval_sec / 60)}m`
      : `${s.interval_sec}s`
    const iter = s.max_iterations ? `${s.iterations_completed}/${s.max_iterations}` : `${s.iterations_completed}`
    const next = new Date(s.next_run_at).toLocaleTimeString()
    return `  Every <b>${interval}</b> | Runs: ${iter} | Next: ${next}`
  })

  await sendReply(chatId, `<b>Active Schedules (${schedules.length}):</b>\n\n${lines.join('\n')}`)
}

async function handleBalance(chatId: number) {
  const walletAddress = await getWalletForChat(chatId)
  if (!walletAddress) {
    await sendReply(chatId, 'No wallet linked. Use /link YOUR_WALLET_ADDRESS first.')
    return
  }

  try {
    const algodUrl = process.env.ALGOD_URL ?? 'https://testnet-api.4160.nodely.dev'
    const res = await fetch(`${algodUrl}/v2/accounts/${walletAddress}`)
    if (!res.ok) {
      await sendReply(chatId, 'Could not fetch balance. Check your wallet address.')
      return
    }
    const account = await res.json() as { amount?: number; assets?: { 'asset-id': number; amount: number }[] }
    const algoBalance = (account.amount ?? 0) / 1_000_000
    const algoPrice = await fetchPrice('algorand')
    const usdValue = algoBalance * algoPrice
    const inrValue = usdValue * 85.5

    const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    const lines = [
      `<b>Wallet Balance</b>`,
      `<code>${shortAddr}</code>`,
      '',
      `ALGO: <b>${algoBalance.toFixed(4)}</b>`,
      `USD:  <b>$${usdValue.toFixed(2)}</b>`,
      `INR:  <b>Rs ${inrValue.toFixed(2)}</b>`,
      `Price: $${algoPrice.toFixed(4)}/ALGO`,
    ]

    const assets = account.assets ?? []
    if (assets.length > 0) {
      lines.push('', `<b>ASAs:</b> ${assets.length} opted-in`)
      for (const a of assets.slice(0, 5)) {
        lines.push(`  ASA ${a['asset-id']}: ${a.amount}`)
      }
      if (assets.length > 5) lines.push(`  ... and ${assets.length - 5} more`)
    }

    await sendReply(chatId, lines.join('\n'))
  } catch (e) {
    console.error('[Telegram] Balance error:', e)
    await sendReply(chatId, 'Failed to fetch balance. Try again later.')
  }
}

async function handlePrice(chatId: number) {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=algorand&vs_currencies=usd,inr&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true')
    if (!res.ok) {
      await sendReply(chatId, 'Could not fetch price data. Try again later.')
      return
    }
    const data = await res.json() as { algorand?: { usd?: number; inr?: number; usd_24h_change?: number; usd_24h_vol?: number; usd_market_cap?: number } }
    const algo = data.algorand
    if (!algo?.usd) {
      await sendReply(chatId, 'Price data unavailable.')
      return
    }

    const change = algo.usd_24h_change ?? 0
    const direction = change >= 0 ? 'UP' : 'DOWN'
    const vol = algo.usd_24h_vol ? `$${(algo.usd_24h_vol / 1_000_000).toFixed(1)}M` : 'N/A'
    const mcap = algo.usd_market_cap ? `$${(algo.usd_market_cap / 1_000_000_000).toFixed(2)}B` : 'N/A'
    const inrPrice = algo.inr ?? algo.usd * 85.5

    await sendReply(chatId, [
      `<b>ALGO Live Price</b>`,
      '',
      `USD: <b>$${algo.usd.toFixed(4)}</b>`,
      `INR: <b>Rs ${inrPrice.toFixed(2)}</b>`,
      `24h: ${direction} <b>${change >= 0 ? '+' : ''}${change.toFixed(2)}%</b>`,
      `Volume: ${vol}`,
      `Market Cap: ${mcap}`,
    ].join('\n'))
  } catch (e) {
    console.error('[Telegram] Price error:', e)
    await sendReply(chatId, 'Failed to fetch price. Try again later.')
  }
}

async function handleWorkflowBuild(chatId: number, instruction: string) {
  if (!instruction.trim()) {
    await sendReply(
      chatId,
      [
        '<b>Build a workflow</b>',
        '',
        'Example:',
        '<code>/workflow_build timer every 5 minutes fetch ALGO price and send it to Telegram</code>',
        '',
        'Your linked wallet is used for saving. On-chain swaps and transfers must be run in the Zuik web app to sign.',
      ].join('\n'),
    )
    return
  }

  const walletAddress = await getWalletForChat(chatId)
  if (!walletAddress) {
    await sendReply(chatId, 'Link your wallet first: /link YOUR_ALGORAND_ADDRESS')
    return
  }

  await sendReply(chatId, 'Building workflow with AI… one moment.')

  const result = await buildWorkflowFromText(instruction, {
    walletAddress,
    telegramChatId: String(chatId),
  })

  if (!result.ok || !result.parsed) {
    await sendReply(chatId, `Could not build workflow: ${result.error ?? 'Unknown error'}`)
    return
  }

  if (!result.flowJson || (result.flowJson.nodes as unknown[]).length === 0) {
    await sendReply(chatId, result.parsed.explanation || 'No workflow steps were generated.')
    return
  }

  const flowJson = result.flowJson as { nodes: Array<{ data?: { blockId?: string; config?: Record<string, unknown> } }>; edges: unknown[] }

  for (const n of flowJson.nodes) {
    const cfg = n.data?.config
    if (!cfg) continue
    if (n.data?.blockId === 'send-telegram' && String(cfg.chatId ?? '') === '{{telegram_chat_id}}') {
      cfg.chatId = String(chatId)
    }
    if (n.data?.blockId === 'wallet-event' && String(cfg.address ?? '') === '{{user_wallet}}') {
      cfg.address = walletAddress
    }
  }

  const name =
    (result.parsed.workflowName && String(result.parsed.workflowName).trim()) ||
    result.parsed.intent ||
    'Telegram workflow'

  const { data: inserted, error } = await supabase
    .from('workflows')
    .insert({
      wallet_address: walletAddress,
      name: name.slice(0, 120),
      description: result.parsed.explanation.slice(0, 500),
      flow_json: flowJson,
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    console.error('[Telegram] workflow insert:', error)
    await sendReply(chatId, `Save failed: ${error?.message ?? 'database error'}`)
    return
  }

  const id = (inserted as { id: string }).id
  await sendReply(
    chatId,
    [
      '<b>Workflow saved</b>',
      '',
      `<b>${escapeHtml(name)}</b>`,
      '',
      escapeHtml(result.parsed.explanation),
      '',
      `Open in builder: ${ZUIK_APP_URL}/builder?wf=${id}`,
      '',
      'Run from Telegram with /run_workflow (server can only run notification and price checks; swaps need the web app).',
    ].join('\n'),
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function handleRunWorkflowMenu(chatId: number) {
  const walletAddress = await getWalletForChat(chatId)
  if (!walletAddress) {
    await sendReply(chatId, 'No wallet linked. Use /link YOUR_WALLET_ADDRESS first.')
    return
  }

  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, name')
    .eq('wallet_address', walletAddress)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error || !workflows || workflows.length === 0) {
    await sendReply(chatId, 'No saved workflows. Use /workflow_build with a description, or create one in the web app.')
    return
  }

  const rows: { text: string; callback_data?: string; url?: string }[][] = workflows.map((w: { id: string; name: string }) => [
    {
      text: (w.name || 'Untitled').slice(0, 60),
      callback_data: `runwf:${w.id}`,
    },
  ])

  await sendWithButtons(
    chatId,
    '<b>Tap a workflow to run</b>\n\nServer-side runs work for price checks and Telegram alerts. Flows with swaps or wallet triggers open in the web app.',
    rows,
  )
}

async function handleRunWorkflowExecute(chatId: number, workflowId: string) {
  const walletAddress = await getWalletForChat(chatId)
  if (!walletAddress) {
    await sendReply(chatId, 'No wallet linked.')
    return
  }

  const { data: wf, error } = await supabase
    .from('workflows')
    .select('id, name, flow_json')
    .eq('id', workflowId)
    .eq('wallet_address', walletAddress)
    .maybeSingle()

  if (error || !wf) {
    await sendReply(chatId, 'Workflow not found or access denied.')
    return
  }

  const flowJson = wf.flow_json as { nodes: unknown[]; edges: unknown[] }
  if (!flowJson?.nodes?.length) {
    await sendReply(chatId, 'This workflow has no blocks.')
    return
  }

  if (workflowNeedsZuikApp(flowJson as Parameters<typeof workflowNeedsZuikApp>[0])) {
    await sendReply(
      chatId,
      [
        `<b>${escapeHtml(wf.name || 'Workflow')}</b> uses on-chain signing or a browser-only trigger.`,
        '',
        `Open Zuik to run and sign:\n${ZUIK_APP_URL}/builder?wf=${wf.id}`,
      ].join('\n'),
    )
    return
  }

  await sendReply(chatId, `Running <b>${escapeHtml(wf.name || 'workflow')}</b> on the server…`)

  try {
    await executeWorkflowHeadless(flowJson as Parameters<typeof executeWorkflowHeadless>[0], walletAddress, wf.name)
    await sendReply(chatId, `Done. Finished running "${escapeHtml(wf.name || 'workflow')}".`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sendReply(chatId, `Run failed: ${escapeHtml(msg)}`)
  }
}

async function handleProfit(chatId: number) {
  const walletAddress = await getWalletForChat(chatId)
  if (!walletAddress) {
    await sendReply(chatId, 'No wallet linked. Use /link YOUR_WALLET_ADDRESS first.')
    return
  }

  const { data: executions } = await supabase
    .from('executions')
    .select('id, status, started_at, completed_at, duration_ms, total_fees_microalgo, block_count, tx_ids')
    .eq('wallet_address', walletAddress)
    .order('started_at', { ascending: false })
    .limit(20)

  if (!executions || executions.length === 0) {
    await sendReply(chatId, 'No executions found. Run a workflow from the Zuik builder first!')
    return
  }

  const total = executions.length
  const succeeded = executions.filter((e: { status: string }) => e.status === 'success').length
  const failed = executions.filter((e: { status: string }) => e.status === 'failed').length
  const totalFees = executions.reduce((sum: number, e: { total_fees_microalgo?: number }) => sum + (e.total_fees_microalgo ?? 0), 0)
  const totalTxns = executions.reduce((sum: number, e: { tx_ids?: string[] }) => sum + (e.tx_ids?.length ?? 0), 0)
  const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0

  const recent = executions.slice(0, 5)
  const recentLines = recent.map((e: { status: string; started_at: string; duration_ms?: number; block_count?: number }) => {
    const icon = e.status === 'success' ? '[OK]' : e.status === 'failed' ? '[FAIL]' : '[...]'
    const date = new Date(e.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const dur = e.duration_ms ? `${(e.duration_ms / 1000).toFixed(1)}s` : '-'
    return `${icon} ${date} | ${e.block_count ?? 0} blocks | ${dur}`
  })

  await sendReply(chatId, [
    `<b>Execution History</b>`,
    '',
    `Total runs: <b>${total}</b>`,
    `Success: <b>${succeeded}</b> (${successRate}%)`,
    `Failed: <b>${failed}</b>`,
    `Transactions: <b>${totalTxns}</b>`,
    `Fees spent: <b>${(totalFees / 1_000_000).toFixed(4)} ALGO</b>`,
    '',
    '<b>Recent:</b>',
    ...recentLines,
  ].join('\n'))
}

async function handleFreeText(chatId: number, text: string) {
  if (!GROQ_API_KEY) {
    await sendReply(chatId, 'AI is not configured. Set GROQ_API_KEY in the agent .env file.')
    return
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are Zuik, a friendly DeFi automation assistant on Algorand. Keep responses concise (2-3 sentences). Help users with trading strategies, DCA, price alerts, and Algorand DeFi concepts. Include INR conversion when mentioning prices (1 USD ~ 85.5 INR). If they want to build a workflow, tell them to use the Zuik web app.',
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    })

    if (!res.ok) {
      await sendReply(chatId, 'Sorry, I could not process that. Try again later.')
      return
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const reply = data.choices?.[0]?.message?.content ?? 'No response generated.'
    await sendReply(chatId, reply)
  } catch (e) {
    console.error('[Telegram] AI error:', e)
    await sendReply(chatId, 'An error occurred. Please try again.')
  }
}

// ── Helpers ─────────────────────────────────────────────

async function getWalletForChat(chatId: number): Promise<string | null> {
  const { data } = await supabase
    .from('telegram_links')
    .select('wallet_address')
    .eq('telegram_chat_id', String(chatId))
    .single()
  return (data as { wallet_address: string } | null)?.wallet_address ?? null
}

// ── Main polling loop ───────────────────────────────────

async function answerCallbackQuery(callbackQueryId: string) {
  if (!TELEGRAM_TOKEN) return
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  }).catch(() => {})
}

async function pollTelegram() {
  const updates = await getUpdates()

  for (const update of updates) {
    lastUpdateId = Math.max(lastUpdateId, update.update_id)

    // Handle inline button callbacks
    if (update.callback_query) {
      const cb = update.callback_query
      const chatId = cb.message?.chat.id ?? cb.from.id
      await answerCallbackQuery(cb.id)

      if (cb.data?.startsWith('runwf:')) {
        const wid = cb.data.slice('runwf:'.length)
        await handleRunWorkflowExecute(chatId, wid)
        continue
      }

      switch (cb.data) {
        case 'action_link':
          await sendReply(chatId, 'To link your wallet, send:\n\n/link YOUR_58_CHAR_ALGORAND_ADDRESS')
          break
        case 'action_balance':
          await handleBalance(chatId)
          break
        case 'action_price':
          await handlePrice(chatId)
          break
        case 'action_workflows':
          await handleWorkflows(chatId)
          break
        case 'action_commands':
          await handleCommands(chatId)
          break
        case 'action_profit':
          await handleProfit(chatId)
          break
        case 'action_status':
          await handleStatus(chatId)
          break
      }
      continue
    }

    const msg = update.message
    if (!msg?.text) continue

    const chatId = msg.chat.id
    const text = msg.text.trim()
    const firstName = msg.from?.first_name
    const username = msg.from?.username

    if (text === '/start' || text === '/help') {
      await handleStart(chatId, firstName, username)
    } else if (text === '/commands' || text === '/options') {
      await handleCommands(chatId)
    } else if (text.startsWith('/link')) {
      const address = text.replace('/link', '').trim()
      await handleLink(chatId, address)
    } else if (text === '/unlink') {
      await handleUnlink(chatId)
    } else if (text === '/balance') {
      await handleBalance(chatId)
    } else if (text === '/price') {
      await handlePrice(chatId)
    } else if (text === '/workflows') {
      await handleWorkflows(chatId)
    } else if (/^\/workflow_build(\@\S+)?\s*$/i.test(text)) {
      await handleWorkflowBuild(chatId, '')
    } else if (text.startsWith('/workflow_build')) {
      const rest = text.replace(/^\/workflow_build(\@\S+)?\s*/i, '').trim()
      await handleWorkflowBuild(chatId, rest)
    } else if (/^\/run_workflow(\@\S+)?\s*$/i.test(text)) {
      await handleRunWorkflowMenu(chatId)
    } else if (text === '/status') {
      await handleStatus(chatId)
    } else if (text === '/profit') {
      await handleProfit(chatId)
    } else if (text.startsWith('/')) {
      await sendReply(chatId, 'Unknown command. Tap /commands for the full list.')
    } else {
      await handleFreeText(chatId, text)
    }
  }
}

async function setWebhook() {
  if (!TELEGRAM_TOKEN) return
  
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || ''
  if (!webhookUrl) return

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        max_connections: 40,
      }),
    })
    
    const result = await response.json()
    if (result.ok) {
      console.log('[Telegram] ✅ Webhook set successfully')
    } else {
      console.error('[Telegram] ❌ Failed to set webhook:', result.description)
    }
  } catch (error) {
    console.error('[Telegram] ❌ Webhook setup error:', error)
  }
}

export function handleTelegramWebhook(update: TelegramUpdate) {
  handleUpdate(update)
}

export async function startTelegramBot(sb: SupabaseClient) {
  supabase = sb

  if (!TELEGRAM_TOKEN) {
    console.log('[Telegram] No bot token configured, skipping bot startup')
    return
  }

  console.log('[Telegram] 🤖 Starting Telegram bot...')
  setBotCommands()

  if (useWebhook) {
    console.log('[Telegram] 📡 Using webhook mode')
    await setWebhook()
  } else {
    console.log('[Telegram] 🔄 Using polling mode')
    pollUpdates()
}

const poll = async () => {
    while (true) {
      try {
        await pollTelegram()
      } catch (e) {
        console.error('[Telegram] Poll error:', e)
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  poll()
}
