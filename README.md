# AI Agent Workflow Builder

A simplified prototype of an AI-agent workflow builder using Hasura, PostgreSQL, and Next.js.

## Local setup

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Start the database and Hasura:
   ```bash
   docker compose up -d
   ```
3. Apply the schema and seed migrations to PostgreSQL. From the project root run:
   ```bash
   cat hasura/migrations/1680000000000_create_workflow_schema/up.sql | docker compose exec -T postgres psql -U postgres -d ai_workflows
   cat hasura/migrations/1680000000001_seed_sample_data/up.sql | docker compose exec -T postgres psql -U postgres -d ai_workflows
   cat hasura/migrations/1680000000002_add_db_write_and_notifications/up.sql | docker compose exec -T postgres psql -U postgres -d ai_workflows
   ```
4. Start the frontend:
   ```bash
   npm install
   npm run dev
   ```

## Testing the workflow

- The app simulates authenticated users with a switcher.
- Use Org A users to view and run Org A workflows, and Org B users to prove cross-org isolation.
- Sample users:
  - Org A Owner: `org-a-owner`
  - Org A Editor: `org-a-editor`
  - Org A Viewer: `org-a-viewer`
  - Org B Owner: `org-b-owner`
  - Org B Viewer: `org-b-viewer`
- Manual runs are triggered with the `Run workflow` button.
- A webhook trigger is available at `http://localhost:3000/api/webhook/org-a-sample` for the seeded Org A workflow.
- Approval gates pause runs and only owner/editor roles in the same org can approve them.
- The UI supports building a new workflow by adding steps and triggers and saving them through Hasura.

## Project layout

- `hasura/migrations/` contains the Postgres schema and seed migrations.
- `hasura/metadata/metadata.yaml` contains Hasura table tracking, relationships, permissions, actions, and the notification event trigger.
- `app/api/hasura/action/` implements Hasura actions for `triggerWorkflowRun` and `approveStep`.
- `app/api/webhook/[...slug]/route.ts` exposes a webhook trigger endpoint.
- Hasura permissions enforce both org membership and step-level gating: editors cannot create `db_write` or `notify` steps, nor webhook triggers.

## Architecture

- `docker-compose.yml` runs PostgreSQL and Hasura.
- `hasura/migrations` defines the workflow schema.
- `hasura/metadata/metadata.yaml` defines table relationships, permissions, and Hasura Actions.
- `app/api/hasura/action/triggerWorkflowRun/route.ts` and `app/api/hasura/action/approveStep/route.ts` implement Hasura Action handlers.
- `app/page.tsx` is a minimal Next.js interface with org context, workflow listing, manual run, and step-run subscription.

## Notes

- The backend action handlers communicate directly with PostgreSQL via `DATABASE_URL`.
- For demonstration, the LLM step is stubbed in code, but the action handler is built so it can call a real LLM API when configured.
- The Hasura metadata includes role-scoped org permissions and step-level insert gating on gate-worthy step types.
