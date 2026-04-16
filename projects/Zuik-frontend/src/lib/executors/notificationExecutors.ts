import type { AgentContext } from '../runAgent'

export type ExecutorFn = (
  config: Record<string, string | number | undefined>,
  context: AgentContext,
  upstreamOutputs?: Record<string, unknown>
) => Promise<Record<string, unknown> | null>

export const sendTelegramExecutor: ExecutorFn = async (config, context) => {
  const token = ((import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string) ?? '').trim()
  const chatId = (config.chatId as string)
    || (typeof localStorage !== 'undefined' ? localStorage.getItem('zuik_telegram_chat_id') ?? '' : '')
  let message = config.message as string

  if (!token) {
    context.log({
      nodeId: '', blockId: 'send-telegram', blockName: 'Send Telegram',
      type: 'skip', message: 'VITE_TELEGRAM_BOT_TOKEN not set. Skipping.',
    })
    return { sent: false }
  }
  if (!chatId) {
    throw new Error(
      'Send Telegram: no chat ID set. Open @ZuikDeFiBot in Telegram, send /start, then copy your Chat ID into Settings.'
    )
  }
  if (!message) {
    throw new Error('Send Telegram: message is required')
  }

  message = context.variables.resolve(message, context.blockOutputs)

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    })
    const data = await res.json()
    return { sent: (data as Record<string, unknown>).ok === true }
  } catch (err) {
    throw new Error(`Send Telegram: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export const sendDiscordExecutor: ExecutorFn = async (config, context) => {
  const webhookUrl = config.webhookUrl as string
  let message = config.message as string

  if (!webhookUrl) throw new Error('Send Discord: webhookUrl is required')
  if (!message) throw new Error('Send Discord: message is required')

  message = context.variables.resolve(message, context.blockOutputs)

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    })
    return { sent: res.ok }
  } catch (err) {
    throw new Error(`Send Discord: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export const browserNotificationExecutor: ExecutorFn = async (config, context) => {
  const title = (config.title as string) || 'Zuik'
  let body = (config.body as string) || ''

  body = context.variables.resolve(body, context.blockOutputs)

  if (typeof Notification === 'undefined') {
    return { shown: false }
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/zuik-logo.png' })
    return { shown: true }
  }

  return { shown: false }
}

export const notificationExecutors: Record<string, ExecutorFn> = {
  'send-telegram': sendTelegramExecutor,
  'send-discord': sendDiscordExecutor,
  'browser-notify': browserNotificationExecutor,
}
