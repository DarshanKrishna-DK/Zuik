# ZUIK Page Capabilities

Per-page breakdown for the voice assistant: what each route offers, prerequisites, interactive regions, and suggested voice actions. Cross-reference `navigation-map.md` for URLs and `component-registry.md` for selectors.

---

## Global prerequisites

| Requirement | Affects | Voice behavior |
|-------------|---------|----------------|
| Wallet connected | Dashboard, agent funding, on-chain settings, execution | Say "connect wallet" → click `nav-connect-wallet` |
| Supabase configured | Dashboard cloud sync, workflow save/load | Inform user if dashboard shows "Supabase Not Configured" |
| Server running | Agent balance, headless execute, AI chat | Default `http://localhost:4021` |
| Guardian app ID set | On-chain policy | Warn if Agent Management shows Guardian banner |
| Groq on server | AI chat | ChatPanel shows configuration error if unavailable |

---

## `/` - Landing

**Component:** `src/pages/Landing.tsx`  
**Navbar:** Hidden  
**Wallet:** Optional

### Visible regions

| Region | CSS / role | Purpose |
|--------|------------|---------|
| Hero | `.landing-hero` | Product pitch, primary CTA |
| Features | `.landing-features` | Capability cards |
| Stats | animated counters | Social proof |
| Footer | links | GitHub, Telegram |

### Actions

| Action | Control | Voice phrase examples |
|--------|---------|----------------------|
| Start building | `data-testid="landing-start-building"` | "Start building", "Open the workflow builder" |
| Connect wallet | Hero/footer wallet buttons → `onConnectWallet` | "Connect my wallet" |
| Go to builder (direct) | Navigate `/builder` | "Take me to the builder" (skips wallet gate) |

### Limitations

- No access to Builder, Market, Dashboard, Settings nav from navbar (must use URL or CTA).
- "Start building" triggers wallet modal if disconnected.

---

## `/builder` - Workflow Builder

**Component:** `src/pages/Builder.tsx`  
**Wallet:** Required for signing; not required to open editor

### Layout regions

| Region | Component | Collapsible |
|--------|-----------|-------------|
| Block sidebar | `Sidebar` | Yes (`.zuik-sidebar-collapsed`) |
| Canvas toolbar | inline in Builder | No |
| React Flow canvas | `.react-flow` | No |
| AI chat | `ChatPanel` | Toggle via AI button |
| Templates | `TemplateGallery` | Toggle |
| Test run | `TransactionPanel` | Menu → Run Workflow (Test) |
| Schedule | `SchedulePanel` | Menu → Schedule Run |
| Execution log | `ExecutionLog` | Menu → Execution Log |
| Payroll editor | `.payroll-panel` | When `employee-payroll` template active |

### Toolbar capabilities

| Capability | UI | Notes |
|------------|-----|-------|
| Rename workflow | `.zuik-wf-name-input` | Auto-saves on blur if workflow ID exists |
| Execution mode | `execution-mode-selector` | User sign vs agent wallet |
| Agent run controls | `.zuik-agent-controls` | Run, Pause, Resume, Stop, Clear |
| Open AI assistant | `builder-ai-assistant` | Opens ChatPanel |
| Open templates | Button "Templates" | Opens TemplateGallery |
| Save / export / import | Hamburger menu `.z-builder-menu` | Save needs Supabase or local |
| Schedule | Menu → Schedule Run | Needs saved workflow + Supabase |
| Manual test | Menu → Run Workflow (Test) | Opens TransactionPanel |
| Execution log | Menu → Execution Log | Shows agent run logs |

### AI ChatPanel (`ChatPanel.tsx`)

| Mode | Purpose | Entry |
|------|---------|-------|
| `builder` | Generate/modify workflow from natural language | Default |
| `advisor` | Trading strategy Q&A | Mode toggle inside panel |

**Controls:**

- Input: `data-testid="chat-input"`
- Send: `data-testid="chat-send"`
- Intent templates: clickable chips (Swap, DCA, price alert, etc.)
- Advisor starters: strategy, DCA setup, portfolio protection, etc.

**Intent outcomes** (via `handleIntentParsed`):

- Add blocks to canvas
- Modify block config
- Delete blocks
- Clear and rebuild canvas

### Canvas interactions

| Action | Method |
|--------|--------|
| Add block | Drag from sidebar OR AI intent |
| Connect blocks | Drag between node handles |
| Configure block | Click node → inline config in `GenericNode` |
| Delete node | Select + Delete/Backspace |
| Pan/zoom | React Flow controls + mouse |

### Workflow lifecycle

1. **New workflow** - empty canvas or template
2. **Save** - creates Supabase row, URL becomes `/builder?wf={id}`
3. **Load** - `/builder?wf={uuid}` or dashboard row click
4. **Run agent** - AgentControls Run (live monitoring triggers)
5. **Test** - TransactionPanel (step-through with wallet)
6. **Schedule** - SchedulePanel → server poll executes agent workflows

### Deep links and state

| Entry | URL / state |
|-------|-------------|
| Load workflow | `/builder?wf={workflowId}` |
| Market quick trade | `/builder` + `state.prefillIntent` |
| Dashboard open | navigate from row → `/builder?wf={id}` |

### Voice action catalog

| User intent | Steps |
|-------------|-------|
| "Open AI assistant" | Click `builder-ai-assistant` |
| "Create a DCA bot" | Open AI → send "Every hour, buy 5 ALGO with USDC" OR Templates → DCA Bot |
| "Switch to agent mode" | Click agent wallet button inside `execution-mode-selector` |
| "Run the workflow" | Click Run in `.zuik-agent-controls` (if idle) |
| "Stop the agent" | Click Stop |
| "Save my workflow" | Menu → Save |
| "Schedule daily at 9am" | Menu → Schedule Run (clarify interval in panel) |
| "Test this workflow" | Menu → Run Workflow (Test) |
| "Clear the canvas" | AgentControls → Clear (destructive - confirm) |
| "Add a timer block" | Drag `timer-loop` from sidebar OR ask AI |

### Execution mode constraints

Voice must explain when agent mode is blocked:

- Workflow contains swap/opt-in/create-asa/call-contract blocks
- No saved workflow ID (for agent creation)
- Agent not funded or policy missing/expired

---

## `/market` - Market Explorer

**Component:** `src/pages/Market/MarketExplorer.tsx`  
**Wallet:** Not required

### Query parameters

| Param | Example | Behavior |
|-------|---------|----------|
| `asset` | `10458941` | Numeric ASA id |
| `asset` | `cg:algorand` | CoinGecko-style id |

Default: first top mover when no param.

### Layout regions

| Region | Component | Purpose |
|--------|-----------|---------|
| Breadcrumb | `MarketBreadcrumb` | ALGO price, fiat selector |
| Token search | `TokenSearch` | Search and select tokens |
| Chart | `TokenChart` | Price history |
| Stats | `TokenStats` | Market cap, volume, changes |
| Buy/sell pressure | `BuySellPressure` | Order flow visualization |
| Fear & greed | `FearGreed` | Sentiment index |
| Top movers | `TopMovers` | Gainers/losers list |
| Quick swap | `QuickSwapButton` | Prefill builder swap |

### Actions

| Action | Selector | Notes |
|--------|----------|-------|
| Select token | Click row in TopMovers or TokenSearch | Updates `?asset=` |
| Change fiat | Breadcrumb fiat dropdown | USD, EUR, GBP, INR, JPY, etc. |
| Trade token | `market-trade-button` | Navigates to builder with swap intent |
| View quick swap card | `market-quick-swap` | Always visible when token loaded |

### Voice phrases

- "Open market" → `/market`
- "Show ALGO" → `/market?asset=0` or search ALGO
- "Trade this token" → click `market-trade-button` (Algorand ASAs only)
- "What's the fear and greed index?" → read `.market` fear/greed section text

---

## `/dashboard` - Dashboard

**Component:** `src/pages/Dashboard.tsx`  
**Wallet:** Required  
**Supabase:** Required for full experience

### Empty states

| Condition | UI |
|-----------|-----|
| No wallet | `.zuik-connect-prompt` "Connect Wallet" |
| No Supabase | `.zuik-connect-prompt` "Supabase Not Configured" |

### Regions

| Region | Content |
|--------|---------|
| Agent health card | `dash-agent-health` - fleet count, policies, health % |
| Stats grid | Workflows, executions, success rate, total fees |
| Charts | Executions over time, status breakdown pie |
| Workflow list | Searchable rows with actions |
| Recent executions | Table with status, duration, fees, tx links |

### Workflow row actions

| Action | Control | Effect |
|--------|---------|--------|
| Open | Row click or Play icon | `/builder?wf={id}` |
| Toggle active | Pause icon | Updates `is_active` in Supabase |
| Duplicate | Copy icon | Creates copy |
| Delete | Trash icon | Removes workflow |

### Voice phrases

- "Show my dashboard" → `/dashboard`
- "How many workflows do I have?" → read `.zuik-stat-value` in first stat card
- "Open my DCA workflow" → search list by name, navigate
- "Show agent health" → click `dash-agent-health` or read card text
- "What's my success rate?" → read success rate stat

---

## `/settings` - Settings

**Component:** `src/pages/Settings.tsx` + section components  
**Layout:** `SettingsLayout` with sidebar nav

### Section map

| Section ID | URL | Component | testid (section) |
|------------|-----|-----------|------------------|
| `account` | `/settings` or `?section=account` | `AccountSettings` | (none) |
| `agents` | `?section=agents` | `AgentManagement` | `agent-management` |
| `risk` | `?section=risk` | `RiskManagementSettings` | `risk-settings` |
| `telegram` | `?section=telegram` | `TelegramSettings` | (none) |

Nav buttons: `settings-nav-account`, `settings-nav-agents`, `settings-nav-risk`, `settings-nav-telegram`.

---

### Account section

**Capabilities:**

- View connection status (connected / not connected)
- View wallet address with Lora explorer link
- View network label (Testnet / Mainnet / Local network)

**Voice:** "Show my wallet address", "What network am I on?"

No form submission - informational only.

---

### Agent Management section

**Primary surface for:** agent wallets, Guardian policies, funding, recipients.

**Summary stats:** total balance, active policies, average health.

**Actions:**

| Action | Selector / pattern |
|--------|-------------------|
| Refresh fleet | Button `aria-label="Refresh"` |
| Create agent (wizard) | `create-agent-wallet` |
| Expand agent card | Click `agent-card-{wallet.id}` header |
| Toggle agent enabled | `agent-toggle-{wallet.id}` |
| Fund agent | `fund-agent-wallet` (after entering amount) |
| Allow recipient | Form inside expanded card |
| Edit policy | Policy edit UI on expanded card |
| Global Guardian pause/resume | "Global Guardian control" section |
| Archive agent | Trash on card |

**Wizard steps:** create → fund → policy → ready

**Guardian on-chain actions** (wallet signature required):

- Bootstrap policy (legacy `GuardianSettings` still has `guardian-bootstrap`)
- Allow recipient (`guardian-allow-recipient` in legacy component)

**Voice phrases:**

- "Open agent settings" → `/settings?section=agents`
- "Create a new agent" → click `create-agent-wallet`
- "Fund agent with 2 ALGO" → expand card, set amount field, click `fund-agent-wallet`
- "Pause Guardian" → global pause control (confirm destructive)

---

### Risk Management section

**Capabilities:**

- Adjust max ASA risk score (0-100) via slider
- Persisted to localStorage immediately
- Reset to default button

| Control | Selector |
|---------|----------|
| Risk slider | `risk-slider` (input type range) |
| Reset | Button "Reset to default" |

**Voice:** "Set risk tolerance to 42" → navigate to risk, set slider value, verify persistence.

---

### Telegram section

**Capabilities:**

- Display bot username (`VITE_TELEGRAM_BOT_USERNAME`, default `ZuikDeFiBot`)
- Save chat ID to `localStorage` key `zuik_telegram_chat_id`
- Open bot in Telegram (external link)

| Control | ID |
|---------|-----|
| Chat ID input | `#telegram-chat-id` |

**Voice:** "Set my Telegram chat ID to 123456789" → fill input (triggers save on change).

---

## Cross-page workflows (voice playbooks)

### Playbook: First workflow

1. "Connect wallet" (if needed)
2. "Open builder"
3. "Open AI assistant"
4. "Build a workflow that sends 1 ALGO every day"
5. "Save workflow"
6. "Switch to you sign mode" or setup agent in settings

### Playbook: Agent automation

1. "Open agent settings"
2. "Create a new agent"
3. Complete wizard: fund → select policy template
4. "Open builder" with saved workflow
5. "Switch to agent wallet mode"
6. "Run the workflow"

### Playbook: Market to trade

1. "Open market"
2. "Show USDC" (or select token)
3. "Trade this token"
4. Builder opens with prefilled swap - "Open AI" to refine amounts

### Playbook: Monitor executions

1. "Show dashboard"
2. Read stats or "Show recent executions"
3. "Open workflow {name}" to edit

---

## Panel/modal index (builder overlays)

| Panel | Open method | Close method |
|-------|-------------|--------------|
| ChatPanel | AI button | X in panel / toggle AI |
| TemplateGallery | Templates button | Close in gallery |
| TransactionPanel | Menu → Test | Panel close |
| SchedulePanel | Menu → Schedule | Panel close |
| ExecutionLog | Menu → Log | Panel close |
| ConnectWallet | nav-connect-wallet | Close modal / backdrop |

Voice assistant should close overlays before navigating away to avoid stale UI state.
