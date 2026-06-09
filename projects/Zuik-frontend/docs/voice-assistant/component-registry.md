# ZUIK Component Registry

Interactive elements, `data-testid` values, CSS selectors, ARIA labels, and interaction patterns for programmatic UI control. Prefer `data-testid` when present; fall back to role/label selectors documented below.

**Convention:** Playwright uses `data-testid`. ConnectWallet modal uses legacy `data-test-id` (hyphenated).

---

## Registry summary table

| testid | Location | Element | Action |
|--------|----------|---------|--------|
| `nav-connect-wallet` | Navbar | Button | Open wallet modal |
| `landing-start-building` | Landing | Button | Connect + go to builder |
| `builder-ai-assistant` | Builder toolbar | Button | Toggle AI ChatPanel |
| `execution-mode-selector` | Builder toolbar | Container | Execution mode UI |
| `chat-input` | ChatPanel | Input | AI message text |
| `chat-send` | ChatPanel | Button | Submit AI message |
| `market-quick-swap` | Market | Card | Quick swap section |
| `market-trade-button` | Market | Button | Navigate to builder swap |
| `dash-agent-health` | Dashboard | Link | Go to agent settings |
| `settings-nav-account` | Settings sidebar | Button | Account section |
| `settings-nav-agents` | Settings sidebar | Button | Agent Management |
| `settings-nav-risk` | Settings sidebar | Button | Risk section |
| `settings-nav-telegram` | Settings sidebar | Button | Telegram section |
| `agent-management` | Settings | Section | Agent fleet panel |
| `create-agent-wallet` | Agent Management | Button | Open create wizard |
| `agent-card-{id}` | Agent Management | Article | Agent card (`id` = wallet row id) |
| `agent-toggle-{id}` | Agent Management | Toggle | Enable/disable agent |
| `fund-agent-wallet` | Agent Management | Button | Submit fund tx |
| `risk-settings` | Risk section | Section | Risk panel |
| `risk-slider` | Risk section | Input range | Max token risk 0-100 |
| `guardian-settings` | GuardianSettings (legacy) | Section | Still in codebase |
| `guardian-bootstrap` | GuardianSettings | Button | Bootstrap Guardian policy |
| `guardian-allow-recipient` | GuardianSettings | Button | Allow payment recipient |
| `agent-wallet-settings` | AgentWalletSettings (legacy) | Section | Superseded by AgentManagement |

Dynamic IDs: replace `{id}` with wallet UUID from DOM or agent overview API.

---

## Global shell

### Navbar

```javascript
// Connect wallet (disconnected)
document.querySelector('[data-testid="nav-connect-wallet"]')?.click()

// Nav links - by role
document.querySelector('a.zuik-nav-link[href="/builder"]') // or getByRole
```

| Selector | Purpose |
|----------|---------|
| `.zuik-navbar-brand` | Logo → `/` |
| `.zuik-nav-link` | Primary nav links |
| `.zuik-wallet-trigger` | Connected wallet dropdown |
| `.zuik-wallet-item` | Balance lines in dropdown |
| `[data-testid="nav-connect-wallet"]` | Connect button |

### ConnectWallet modal

| Selector | Purpose |
|----------|---------|
| `.z-modal-backdrop` | Modal overlay |
| `.z-modal-box` | Modal content |
| `[data-test-id="close-wallet-modal"]` | Close (note attribute name) |
| Wallet list items | Inside modal - wallet provider buttons |

---

## Landing page

| testid | Tag | Voice action |
|--------|-----|--------------|
| `landing-start-building` | button | Start building flow |

Additional selectors:

| Selector | Purpose |
|----------|---------|
| `.landing-hero` | Hero section |
| `.landing-nav-brand` | Header brand |

---

## Builder

### Toolbar

| testid / selector | Element | Interaction |
|-------------------|---------|-------------|
| `builder-ai-assistant` | Button | Toggle chat |
| `execution-mode-selector` | div | Contains mode buttons |
| `.zuik-wf-name-input` | input | Workflow title |
| `.zuik-agent-controls` | div | Run/Stop/Pause/Clear |
| `.z-builder-menu-btn` | button | Hamburger menu |
| `.z-builder-dropdown button` | buttons | Save, export, schedule, test, log |

**Execution mode buttons** (inside `execution-mode-selector`):

| Selector | Mode |
|----------|------|
| `.zuik-exec-mode-btn.active` | Current mode |
| Button containing "You sign" | `user` mode |
| Button containing "Agent wallet" | `agent` mode |
| `.zuik-exec-mode-link` | Link to settings |

**Agent controls** (no testids - use text/title):

| Button title | Action |
|--------------|--------|
| "Start agent - continuously monitor..." | Run |
| "Pause" | Pause |
| "Resume" | Resume |
| "Stop" | Stop |
| "Clear Canvas" | Clear (destructive) |

### React Flow canvas

| Selector | Purpose |
|----------|---------|
| `.react-flow` | Canvas root |
| `.react-flow__node` | Workflow nodes |
| `.react-flow__controls` | Zoom/fit controls |
| `.react-flow__minimap` | Minimap |

Node config: click node → config fields inside `.generic-node` / node panel.

### Sidebar (blocks)

| Selector | Purpose |
|----------|---------|
| `.zuik-sidebar` | Block palette |
| `.zuik-sidebar-collapsed` | Collapsed state |
| `.zuik-sidebar-search input` | Block search |
| `.zuik-block-item` | Draggable block |
| `.zuik-category-header` | Category accordion |

Drag payload MIME: `application/zuik-block` with block id string.

### ChatPanel

| testid | Element | Notes |
|--------|---------|-------|
| `chat-input` | input | Stop key propagation handled in component |
| `chat-send` | button | Sends message to intent parser |

Mode toggle: buttons labeled Builder / Advisor inside panel (no testid).

Template chips: `.zuik-chat-template` or similar intent template buttons (click to fill input).

### Overlays (no testids)

| Component | Open trigger | Close |
|-----------|--------------|-------|
| `TemplateGallery` | Templates toolbar button | Gallery close control |
| `TransactionPanel` | Menu → Run Workflow (Test) | Panel onClose |
| `SchedulePanel` | Menu → Schedule Run | Panel onClose |
| `ExecutionLog` | Menu → Execution Log | Panel onClose |

Use button text matching from hamburger dropdown.

### Payroll panel (conditional)

| Selector | Purpose |
|----------|---------|
| `.payroll-panel` | Container when employee-payroll template active |
| `.payroll-row input` | Employee fields |
| `.payroll-row-remove` | Remove row |
| Button "Apply to canvas" | Apply payroll to workflow |

---

## Market

| testid | Element |
|--------|---------|
| `market-quick-swap` | Card wrapper |
| `market-trade-button` | Trade CTA |

Other regions (selector-only):

| Selector | Purpose |
|----------|---------|
| `.zuik-market` | Page root |
| `.market-layout` | Grid layout |
| Token search input | Inside `TokenSearch` |
| Top movers rows | Click to select token |

---

## Dashboard

| testid | Element |
|--------|---------|
| `dash-agent-health` | Link card to agents settings |

| Selector | Purpose |
|----------|---------|
| `.zuik-dashboard` | Page root |
| `.zuik-stat-card` | Stat tiles |
| `.zuik-workflow-row` | Workflow list item |
| `.zuik-sidebar-search input` | Workflow search |
| `.dash-exec-row` | Execution history row |
| `.zuik-empty-state button` | Create first workflow CTA |

Row action buttons use icon buttons with `title` attribute: Open, Deactivate/Activate, Duplicate, Delete.

---

## Settings

### Layout navigation

| testid | Section |
|--------|---------|
| `settings-nav-account` | Account |
| `settings-nav-agents` | Agent Management |
| `settings-nav-risk` | Risk |
| `settings-nav-telegram` | Telegram |

Mobile: `.st-mobile-toggle` opens sidebar.

### Account section

No testids. Read-only rows in `.st-section` with `.st-card` content.

### Agent Management

| testid | Element |
|--------|---------|
| `agent-management` | Section root |
| `create-agent-wallet` | New agent wizard |
| `agent-card-{wallet.id}` | Per-agent card |
| `agent-toggle-{wallet.id}` | ToggleSwitch |
| `fund-agent-wallet` | Fund button (multiple - use within expanded card) |

| Selector / label | Purpose |
|------------------|---------|
| `button[aria-label="Refresh"]` | Reload fleet |
| `#fund-{wallet.id}` | Fund amount input (htmlFor on SettingsField) |
| `#rcv-{wallet.id}` | Recipient allow input |
| `.guardian-settings__banner-warn` | Guardian not configured |
| Global Guardian pause/resume | Buttons in global control section |

Wizard steps: track `.agent-mgmt` modal/wizard UI for Create → Fund → Policy.

### Risk Management

| testid | Element | Interaction |
|--------|---------|-------------|
| `risk-settings` | section | Panel root |
| `risk-slider` | input[type=range] | Set 0-100, dispatches input event |

```javascript
const slider = document.querySelector('[data-testid="risk-slider"]')
slider.value = '42'
slider.dispatchEvent(new Event('input', { bubbles: true }))
slider.dispatchEvent(new Event('change', { bubbles: true }))
```

Reset button: text "Reset to default".

### Telegram

| ID | Element |
|----|---------|
| `#telegram-chat-id` | Chat ID input |

| Selector | Purpose |
|----------|---------|
| `.st-telegram-open` | Open Telegram bot link |

---

## ToggleSwitch component

Used for agent enable toggles.

```tsx
<ToggleSwitch testId={`agent-toggle-${entry.wallet.id}`} ... />
```

Renders `data-testid={testId}` on the switch input/button.

---

## Legacy components (still in repo)

`GuardianSettings.tsx` and `AgentWalletSettings.tsx` remain for reference/tests but **Settings page renders `AgentManagement` for agents section**.

| testid | File | Notes |
|--------|------|-------|
| `guardian-settings` | GuardianSettings | Section wrapper |
| `guardian-bootstrap` | GuardianSettings | Policy bootstrap submit |
| `guardian-allow-recipient` | GuardianSettings | Recipient allow submit |
| `agent-wallet-settings` | AgentWalletSettings | Old agent UI |

E2E guardian spec references `settings-nav-guardian` which **does not exist** in current nav - use `settings-nav-agents` instead.

---

## Interaction patterns

### Click button by testid

```javascript
function clickTestId(id) {
  const el = document.querySelector(`[data-testid="${id}"]`)
  if (el instanceof HTMLElement) {
    el.click()
    return true
  }
  return false
}
```

### Fill text input

```javascript
function fillInput(testIdOrSelector, value) {
  const el = document.querySelector(
    testIdOrSelector.startsWith('[')
      ? testIdOrSelector
      : `[data-testid="${testIdOrSelector}"]`,
  )
  if (!(el instanceof HTMLInputElement)) return false
  el.focus()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
```

### Select settings section

```javascript
function goToSettingsSection(section) {
  // Prefer router navigate(`/settings?section=${section}`)
  // Or click: `settings-nav-${section}`
  clickTestId(`settings-nav-${section}`)
}
```

### Toggle execution mode

```javascript
function setExecutionMode(mode /* 'user' | 'agent' */) {
  const root = document.querySelector('[data-testid="execution-mode-selector"]')
  if (!root) return false
  const buttons = root.querySelectorAll('.zuik-exec-mode-btn')
  for (const btn of buttons) {
    if (mode === 'user' && btn.textContent?.includes('You sign')) {
      btn.click()
      return true
    }
    if (mode === 'agent' && btn.textContent?.includes('Agent wallet')) {
      btn.click()
      return true
    }
  }
  return false
}
```

### Send AI chat message

```javascript
function sendBuilderAiMessage(text) {
  clickTestId('builder-ai-assistant') // open if closed
  fillInput('chat-input', text)
  clickTestId('chat-send')
}
```

### Read stat text (dashboard)

```javascript
function readStat(label) {
  const cards = document.querySelectorAll('.zuik-stat-card')
  for (const card of cards) {
    if (card.querySelector('.zuik-stat-label')?.textContent?.includes(label)) {
      return card.querySelector('.zuik-stat-value')?.textContent
    }
  }
  return null
}
```

---

## Elements requiring wallet signature

Voice assistant must **not** auto-complete these - instruct user to approve in wallet:

| UI | Action |
|----|--------|
| `fund-agent-wallet` | Funding transaction |
| Guardian bootstrap / allow recipient | On-chain policy txs |
| ExecutionModeSelector "Sign funding tx" | Agent fund from builder |
| TransactionPanel test run steps | User mode executions |
| ConnectWallet | Wallet connection |

---

## Elements safe for full automation

| UI | Action |
|----|--------|
| Navigation links / router navigate | Route change |
| `risk-slider` | localStorage preference |
| `#telegram-chat-id` | localStorage preference |
| `chat-input` + `chat-send` | AI intent (no chain tx) |
| Settings section nav | UI state |
| Workflow search inputs | Filter only |
| Template selection | Canvas graph change (local) |
| Agent toggle (off) | May disable without chain tx - verify side effects |

---

## Missing testids (future enhancement)

Consider adding testids for voice reliability:

| Component | Suggested testid |
|-----------|------------------|
| AgentControls Run/Stop | `builder-agent-run`, `builder-agent-stop` |
| Template gallery | `builder-template-gallery` |
| Workflow name input | `builder-workflow-name` |
| Dashboard workflow search | `dashboard-workflow-search` |
| Market token search | `market-token-search` |
| Settings wizard steps | `agent-wizard-step-{n}` |
| ConnectWallet | migrate `data-test-id` → `data-testid` |

---

## CSS class reference (stable UI hooks)

Shared button classes from design system:

| Class | Meaning |
|-------|---------|
| `.z-btn` | Base button |
| `.z-btn-primary` | Primary action |
| `.z-btn-ghost` | Secondary |
| `.z-btn-sm` | Small size |
| `.z-btn-icon` | Icon-only |

Status / feedback:

| Class | Meaning |
|-------|---------|
| `.feedback-message` | Settings operation feedback |
| `.zuik-exec-mode-banner` | Execution mode warnings |
| `.zuik-connect-prompt` | Wallet required state |

---

## Verification checklist

When updating this registry:

1. Run `rg 'data-testid' projects/Zuik-frontend/src` and sync table.
2. Run e2e tests: `npm run test:e2e` in `projects/Zuik-frontend/e2e`.
3. Confirm Settings section IDs match `types.ts` `SettingsSectionId`.
4. Note legacy vs active components (AgentManagement vs AgentWalletSettings).
