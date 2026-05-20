import { useState, useCallback } from 'react'
import { IconExternalLink, IconTelegram } from './SettingsIcons'
import {
  SettingsPanelHeader,
  HelpCard,
  SettingsCard,
  SettingsField,
  SettingsInput,
  DetailRow,
  StatusBadge,
  FeedbackMessage,
} from './SettingsPrimitives'

const TG_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ZuikDeFiBot'

export function TelegramSettings() {
  const [tgChatId, setTgChatId] = useState(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('zuik_telegram_chat_id') ?? '' : '',
  )
  const [savedFlash, setSavedFlash] = useState(false)

  const saveTgChatId = useCallback((value: string) => {
    setTgChatId(value)
    if (value.trim()) {
      localStorage.setItem('zuik_telegram_chat_id', value.trim())
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 2500)
    } else {
      localStorage.removeItem('zuik_telegram_chat_id')
      setSavedFlash(false)
    }
  }, [])

  return (
    <section className="st-section">
      <SettingsPanelHeader
        title="Telegram"
        subtitle="Get workflow alerts and updates in Telegram."
      />

      <HelpCard title="Setup in 3 steps">
        <ol className="st-steps-list">
          <li>Open the Zuik bot in Telegram and send /start</li>
          <li>Copy the Chat ID the bot sends you</li>
          <li>Paste it below - workflows with Telegram blocks will use it automatically</li>
        </ol>
      </HelpCard>

      <SettingsCard>
        <DetailRow label="Bot username" value={<code className="st-inline-code">@{TG_BOT_USERNAME}</code>} />
        <DetailRow
          label="Status"
          value={
            tgChatId.trim() ? (
              <StatusBadge variant="success">Connected</StatusBadge>
            ) : (
              <StatusBadge variant="neutral">Not configured</StatusBadge>
            )
          }
        />

        <SettingsField label="Your Chat ID" hint="Paste the number from the bot" htmlFor="telegram-chat-id">
          <SettingsInput
            id="telegram-chat-id"
            type="text"
            value={tgChatId}
            onChange={(e) => saveTgChatId(e.target.value)}
            placeholder="e.g. 123456789"
            mono
          />
        </SettingsField>

        <div className="st-card-footer st-card-footer--stack">
          <a
            href={`https://t.me/${TG_BOT_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="z-btn z-btn-primary st-telegram-open"
          >
            <IconTelegram /> Open in Telegram <IconExternalLink />
          </a>
        </div>
      </SettingsCard>

      {savedFlash && (
        <FeedbackMessage variant="success">
          Chat ID saved. Telegram notifications will use this ID.
        </FeedbackMessage>
      )}
    </section>
  )
}
