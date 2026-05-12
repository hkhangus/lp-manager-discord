# LPAgent Discord Bot

Discord bot MVP for LPAgent communities. Users configure a public wallet address, then use slash commands to inspect balances, LP positions, portfolio metrics, pools, and alerts.

## Stack

- Node.js 22 + TypeScript
- discord.js v14
- PostgreSQL + Prisma
- node-cron for alert polling
- zod for env and input validation
- pino for logging

## Setup

1. Install dependencies:

   ```sh
   yarn install
   ```

2. Copy env values:

   ```sh
   cp .env.example .env
   ```

3. Start local Postgres:

   ```sh
   docker compose up -d
   ```

4. Apply migrations:

   ```sh
   yarn db:migrate
   ```

5. Register Discord slash commands for your dev guild:

   ```sh
   yarn commands
   ```

6. Run the bot:

   ```sh
   yarn dev
   ```

## Commands

- `/wallet connect <address>`
- `/wallet status`
- `/wallet currency <USD|Native>`
- `/wallet unlink`
- `/balance`
- `/positions address:<optional>`
- `/portfolio`
- `/pools search:<token> sort:<optional, defaults to fee_tvl_ratio>`
- `/pool info address:<poolAddress>`
- `/pool positions address:<poolAddress> owner:<optional> status:<optional>`
- `/pool top-lpers address:<poolAddress> sort:<optional>`
- `/alert add type:<type> position_id:<optional> threshold:<optional>`
- `/alert list`
- `/alert remove <id>`

## Security

The MVP stores public wallet addresses only. Do not collect private keys, seed phrases, or signed transactions in Discord. Keep `LPAGENT_API_KEY` server-side in `.env`.
