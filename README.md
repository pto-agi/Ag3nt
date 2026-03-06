# AntiGravity Agent

Multi-agent orchestrator for Trainerize automation – manages workouts and client comments via **API + controlled browser automation** (Playwright).

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Configure credentials
cp .env.example .env
# Edit .env with your Trainerize + OpenAI credentials

# 4. Start the dashboard
npm run dashboard
# → http://localhost:3847/
```

## Dashboard

Start the web dashboard with `npm run dashboard`. It provides:

- **Aktivitetslogg** – live activity feed with reply/dispatch/flag filtering
- **Nytt Ärende** – submit tasks with live agent-routing indicator
- **Uppgiftskö** – view and manage the agent-to-agent task queue
- **Körningar** – trigger any agent directly and monitor run status

All agents can be triggered from the dashboard. The Workout Editor has dedicated buttons for each capability (replace, delete, add, reorder) with an inline form for client email and task description.

## Agents

### Activity Log Handler

Handles client comments in the Trainerize Activity Log. Replies with short professional responses, skips emoji-only messages, and flags medical/injury concerns.

| Capability | Description |
|------------|-------------|
| `handle-comments` | Scan and process all recent comments |
| `reply-to-comments` | Generate and post appropriate replies |

### Workout Editor

Manages exercises in training programs. Uses AI to suggest replacement exercises based on muscle group, injury history, and client goals.

| Capability | Description |
|------------|-------------|
| `replace-exercise` | Swap an exercise for an AI-suggested alternative |
| `delete-exercise` | Remove an exercise from workouts |
| `add-exercise` | Add a new AI-suggested exercise |
| `reorder-exercise` | Move an exercise to a different position |

## CLI Commands

### Generic task routing

```bash
npx tsx src/index.ts run --client <email> --task "<description>" [--agent <id>] [--yes]
```

### Direct commands

```bash
# Replace exercise
npx tsx src/index.ts replace-exercise -c <email> -e "Bench Press" [--dry-run] [--yes]

# Add exercise
npx tsx src/index.ts add-exercise -c <email> -r "add a quad exercise" [--yes]

# Delete exercise
npx tsx src/index.ts delete-exercise -c <email> -e "Dumbbell Deadlift" [--yes]

# Reorder exercise
npx tsx src/index.ts reorder-exercise -c <email> -e "Bench Press" -p 1 [--yes]

# List agents
npx tsx src/index.ts list-agents
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List all registered agents |
| `GET` | `/api/agents/:id` | Get a specific agent |
| `POST` | `/api/tasks` | Submit a task (auto-routed or forced agent) |
| `POST` | `/api/run-agent` | Run an agent directly from dashboard |
| `GET` | `/api/run-status/:id` | Poll a run's current status |
| `GET` | `/api/runs` | List all run history |
| `GET` | `/api/activity-log` | Filterable activity log entries |
| `GET` | `/api/task-queue` | View the task queue |

## Safety Features

| Feature | Description |
|---------|-------------|
| **Dry-run mode** | Preview all changes without saving |
| **Human checkpoint** | Terminal Y/N approval before any save |
| **Low-confidence gate** | Requires typing `YES` when LLM confidence < 60% |
| **Guardrails** | Auto-abort on client mismatch, missing exercise, or UI issues |
| **Selector fallbacks** | Every CSS selector has primary + fallback(s) |
| **Health check** | Validates selectors before each session |
| **Structured logging** | JSON logs with run ID for full auditability |

## Project Structure

```
src/
├── index.ts                # CLI entry point
├── server.ts               # Express API + dashboard server
├── agents/
│   ├── activity-log-handler/
│   │   ├── index.ts        # Agent definition
│   │   ├── runner.ts       # Comment handling pipeline
│   │   └── ai/             # LLM reply generation
│   └── trainerize-workout-editor/
│       ├── index.ts        # Agent definition
│       ├── runner.ts       # Workout edit pipeline
│       ├── ai/             # Intent parsing + replacement suggestion
│       ├── flows/          # replace, add, delete, reorder
│       ├── checkpoint.ts   # Human approval logic
│       └── guardrails.ts   # Pre-save validation
├── orchestrator/
│   ├── registry.ts         # Agent registration
│   └── router.ts           # Task → agent routing
├── shared/
│   ├── config.ts           # Zod-validated config
│   ├── types.ts            # TaskSpec + agent types
│   ├── logger.ts           # Pino structured logger
│   ├── browser/            # Playwright session + selectors
│   ├── store/              # Run store, activity log, task queue
│   └── utils/              # Diff, name-match, retry, artifacts
├── dashboard/
│   └── index.html          # Single-page dashboard
└── tests/
    └── agent.test.ts       # Vitest test suite
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TRAINERIZE_EMAIL` | ✅ | Trainerize login email |
| `TRAINERIZE_PASSWORD` | ✅ | Trainerize login password |
| `OPENAI_API_KEY` | ✅ | OpenAI API key for LLM features |
| `OPENAI_CHAT_MODEL` | | Model name (default: `gpt-4.1-mini`) |
| `TRAINERIZE_HEADLESS` | | Run browser headless (default: `false`) |
| `TRAINERIZE_DRY_RUN` | | Global dry-run mode (default: `false`) |
| `TRAINERIZE_RUN_DIR` | | Run artifacts directory (default: `tmp/trainerize`) |
| `LOG_LEVEL` | | Log level (default: `info`) |
| `PORT` | | Dashboard server port (default: `3847`) |

## Scripts

```bash
npm run dashboard    # Start dashboard + API server
npm run start        # Run CLI
npm run typecheck    # TypeScript type checking
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode tests
```
