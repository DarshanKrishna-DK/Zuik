# Zuik Local Agent

A lightweight Node.js agent that runs on your laptop to enable persistent workflow execution, price monitoring, and Telegram bot integration for Zuik.

## What it does

- **Price Monitoring**: Polls CoinGecko for ALGO/USD prices at configurable intervals
- **Condition Evaluation**: Safe comparison operators (no eval) to check price thresholds
- **Telegram Notifications**: Sends alerts when conditions are met
- **Discord Notifications**: Posts to webhooks when conditions are met
- **Telegram Bot**: Commands for wallet linking, workflow listing, and AI chat
- **Schedule Management**: Picks up active schedules from Supabase and runs them server-side

## Architecture

The agent reads from the same Supabase database as the Zuik frontend. When you start a workflow with a Timer trigger in the web builder, it saves a schedule to Supabase. The agent picks up these schedules and executes the notification paths (price check, condition, Telegram/Discord alerts).

On-chain actions (swaps, payments) are skipped because they require a wallet signer in the browser.

## Setup

1. Install dependencies:

```bash
cd server
npm install
```

2. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

3. Create the `telegram_links` table in Supabase (run in SQL editor):

```sql
CREATE TABLE IF NOT EXISTS telegram_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access" ON telegram_links FOR ALL USING (true);
```

4. Start the agent:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/link <address>` | Link your Algorand wallet to this Telegram chat |
| `/workflows` | List your saved workflows |
| `/status` | Show active schedules |
| Free text | AI-powered DeFi advice via Groq |
