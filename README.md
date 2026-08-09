# AI Agent Workflow Builder

A simplified prototype of an AI-agent workflow builder using Hasura, PostgreSQL, and Next.js.

## 📦 Tech Stack

- **Frontend:** Next.js 14 (App Router, React 18, TypeScript)
- **Backend:** Hasura GraphQL Engine v2 (GraphQL API + actions + event triggers)
- **Database:** PostgreSQL 15
- **Deployment:** Vercel (frontend live demo)

---

## 🌐 Live Demo / Project URL

> ✅ **Live URL:** https://ai-agent-workflow-builder-coral.vercel.app

This is the hosted production build of the Next.js frontend, deployed from the GitHub repo:
**https://github.com/Gowtham10023/ai-agent-workflow-builder**

> ⚠️ **Note:** The live URL currently serves the frontend UI. The full backend functionality
> (Run workflow, live step status, approval gates, webhook triggers) requires PostgreSQL +
> Hasura to be reachable from the deployed app. See [Deploying to Vercel](#deploying-to-vercel).

---

## 🚀 Local setup (run on your machine)

1. Copy `.env.example` to `.env` and adjust values if needed.
   ```bash
   cp .env.example .env
   ```
   Minimum variables:
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_workflows
   NEXT_PUBLIC_HASURA_GRAPHQL_URL=http://localhost:8080/v1/graphql
   HASURA_ADMIN_SECRET=hasura-admin-secret
   ```

2. Start the database and Hasura:
   ```bash
   docker compose up -d
   ```

3. Apply the schema and seed migrations to PostgreSQL:
   ```bash
   cat hasura/migrations/1680000000000_create_workflow_schema/up.sql | docker compose exec -T postgres psql -U postgres -d ai_workflows
   cat hasura/migrations/1680000000001_seed_sample_data/up.sql | docker compose exec -T postgres psql -U postgres -d ai_workflows
   cat hasura/migrations/1680000000002_add_db_write_and_notifications/up.sql | docker compose exec -T postgres psql -U postgres -d ai_workflows
   ```

4. Apply Hasura metadata (actions, permissions, event triggers):
   ```bash
   npx hasura metadata apply
   ```

5. Start the frontend:
   ```bash
   npm install
   npm run dev
   ```

6. Open the app:
   - **Frontend UI:** http://localhost:3000 (or http://127.0.0.1:3001)
   - **Hasura Console:** http://localhost:8080/console (admin secret: `hasura-admin-secret`)

---

## 🧪 Testing the workflow

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

---

## 🖥️ How to check what's currently running

Use these commands to see the running services for this project:

### 1. Next.js frontend processes
```bash
ps aux | grep -E "next|node" | grep -v grep
```
You should see `next-server (v14.2.5)` and `next dev` processes.

### 2. Docker containers (PostgreSQL + Hasura)
```bash
docker compose ps
```
Expected output (both containers up/healthy):
```
myproject-hasura-1     hasura/graphql-engine:v2.24.0   Up (healthy)   0.0.0.0:8080->8080/tcp
myproject-postgres-1   postgres:15-alpine             Up             0.0.0.0:5432->5432/tcp
```

### 3. Listening ports
```bash
lsof -iTCP -sTCP:LISTEN -P | grep -E "node|postgres|docker"
```
Expected ports:
- **3000 / 3001** — Next.js dev server
- **5432** — PostgreSQL
- **8080** — Hasura GraphQL

### 4. Live deployment status
```bash
curl -s -o /dev/null -w "%{http_code}" https://ai-agent-workflow-builder-coral.vercel.app
```
Expected: `200`

---

## ☁️ Deploying to Vercel

The frontend was deployed using the Vercel CLI. To redeploy or set it up yourself:

### 1. Install & login to Vercel CLI
```bash
npm install -g vercel
vercel login          # opens a browser to authorize (user code flow)
vercel whoami         # confirm you're logged in
```

### 2. Deploy
```bash
vercel --prod --yes --name ai-agent-workflow-builder
```
The CLI outputs a **Production** URL (e.g. `https://ai-agent-workflow-builder-<hash>-<team>.vercel.app`)
and an **Aliased** stable URL (e.g. `https://ai-agent-workflow-builder-coral.vercel.app`).

### 3. Set environment variables (for backend features)
To make the deployed app talk to a hosted Hasura backend, set these on Vercel
(Dashboard → Project → Settings → Environment Variables):
```env
NEXT_PUBLIC_HASURA_GRAPHQL_URL=https://your-hasura-host/v1/graphql
```

### 4. Deploy the full stack (optional)
The frontend alone won't run workflows unless the backend is also hosted. To get a fully
working demo, deploy **PostgreSQL + Hasura** to a cloud host (e.g. Railway, Render, Fly.io,
or Hasura Cloud) and point the app to it via `NEXT_PUBLIC_HASURA_GRAPHQL_URL`.

---

## 📁 Project layout

- `hasura/migrations/` contains the Postgres schema and seed migrations.
- `hasura/metadata/metadata.yaml` contains Hasura table tracking, relationships, permissions, actions, and the notification event trigger.
- `app/api/hasura/action/` implements Hasura actions for `triggerWorkflowRun` and `approveStep`.
- `app/api/webhook/[...slug]/route.ts` exposes a webhook trigger endpoint.
- Hasura permissions enforce both org membership and step-level gating: editors cannot create `db_write` or `notify` steps, nor webhook triggers.

---

## 🏗️ Architecture

- `docker-compose.yml` runs PostgreSQL and Hasura.
- `hasura/migrations` defines the workflow schema.
- `hasura/metadata/metadata.yaml` defines table relationships, permissions, and Hasura Actions.
- `app/api/hasura/action/triggerWorkflowRun/route.ts` and `app/api/hasura/action/approveStep/route.ts` implement Hasura Action handlers.
- `app/page.tsx` is a minimal Next.js interface with org context, workflow listing, manual run, and step-run subscription.

---

## 📝 Notes

- The backend action handlers communicate directly with PostgreSQL via `DATABASE_URL`.
- For demonstration, the LLM step is stubbed in code, but the action handler is built so it can call a real LLM API when configured.
- The Hasura metadata includes role-scoped org permissions and step-level insert gating on gate-worthy step types.
- The production build (`npm run build`) passes successfully with all routes compiled.
