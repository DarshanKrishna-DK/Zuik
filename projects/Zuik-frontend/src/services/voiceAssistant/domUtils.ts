/**
 * DOM helpers for voice-driven UI control.
 * Patterns from docs/voice-assistant/component-registry.md
 */

export function clickTestId(testId: string): boolean {
  const el = document.querySelector(`[data-testid="${testId}"]`)
  if (el instanceof HTMLElement) {
    el.click()
    return true
  }
  return false
}

export function clickSelector(selector: string): boolean {
  const el = document.querySelector(selector)
  if (el instanceof HTMLElement) {
    el.click()
    return true
  }
  return false
}

export function fillInput(testIdOrSelector: string, value: string): boolean {
  const selector = testIdOrSelector.startsWith('[')
    ? testIdOrSelector
    : `[data-testid="${testIdOrSelector}"]`
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    return false
  }
  el.focus()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function setRangeSlider(testId: string, value: number): boolean {
  const el = document.querySelector(`[data-testid="${testId}"]`)
  if (!(el instanceof HTMLInputElement) || el.type !== 'range') {
    return false
  }
  const clamped = Math.max(Number(el.min) || 0, Math.min(Number(el.max) || 100, value))
  el.value = String(clamped)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function readStat(label: string): string | null {
  const cards = document.querySelectorAll('.zuik-stat-card')
  for (const card of cards) {
    const cardLabel = card.querySelector('.zuik-stat-label')?.textContent ?? ''
    if (cardLabel.toLowerCase().includes(label.toLowerCase())) {
      return card.querySelector('.zuik-stat-value')?.textContent?.trim() ?? null
    }
  }
  return null
}

export function readWalletBalances(): string[] {
  const items = document.querySelectorAll('.zuik-wallet-item')
  const lines: string[] = []
  items.forEach((item) => {
    const text = item.textContent?.trim()
    if (text) lines.push(text)
  })
  return lines
}

export function isConnectPromptVisible(): boolean {
  return Boolean(document.querySelector('.zuik-connect-prompt'))
}

export async function waitForElement(
  selector: string,
  timeoutMs = 4000,
  intervalMs = 50,
): Promise<Element | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const el = document.querySelector(selector)
    if (el) return el
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return null
}

export function clickButtonByTitle(title: string, root?: ParentNode): boolean {
  const scope = root ?? document
  const buttons = scope.querySelectorAll('button[title]')
  for (const btn of buttons) {
    if (btn.getAttribute('title')?.toLowerCase().includes(title.toLowerCase())) {
      if (btn instanceof HTMLElement) {
        btn.click()
        return true
      }
    }
  }
  return false
}

export function clickButtonByText(text: string, root?: ParentNode): boolean {
  const scope = root ?? document
  const normalized = text.toLowerCase()
  const buttons = scope.querySelectorAll('button')
  for (const btn of buttons) {
    if (btn.textContent?.toLowerCase().includes(normalized)) {
      btn.click()
      return true
    }
  }
  return false
}

export function setExecutionMode(mode: 'user' | 'agent'): boolean {
  const root = document.querySelector('[data-testid="execution-mode-selector"]')
  if (!root) return false
  const buttons = root.querySelectorAll('.zuik-exec-mode-btn')
  for (const btn of buttons) {
    const label = btn.textContent ?? ''
    if (mode === 'user' && label.includes('You sign')) {
      if (btn instanceof HTMLElement) {
        btn.click()
        return true
      }
    }
    if (mode === 'agent' && label.includes('Agent wallet')) {
      if (btn instanceof HTMLElement) {
        btn.click()
        return true
      }
    }
  }
  return false
}

export function sendBuilderAiMessage(text: string): boolean {
  clickTestId('builder-ai-assistant')
  const filled = fillInput('chat-input', text)
  if (!filled) return false
  return clickTestId('chat-send')
}
