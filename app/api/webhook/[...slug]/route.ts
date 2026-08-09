import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { executeWorkflowRun } from '@/lib/workflowRunner';

export async function POST(req: NextRequest, { params }: { params: { slug: string[] } }) {
  const webhookPath = `/${params.slug.join('/')}`;
  const triggerResult = await query(
    `SELECT wt.workflow_id, w.org_id FROM workflow_triggers wt JOIN workflows w ON w.id = wt.workflow_id WHERE wt.trigger_type = 'webhook' AND wt.config->>'path' = $1 LIMIT 1`,
    [webhookPath]
  );
  const trigger = triggerResult.rows[0];
  if (!trigger) {
    return NextResponse.json({ error: 'Webhook path not found' }, { status: 404 });
  }

  const insertResult = await query(
    `INSERT INTO workflow_runs (workflow_id, org_id, status, paused) VALUES ($1, $2, 'running', false) RETURNING id`,
    [trigger.workflow_id, trigger.org_id]
  );
  const runId = insertResult.rows[0].id;
  const result = await executeWorkflowRun(runId);
  return NextResponse.json({ workflow_run_id: runId, status: result.status, paused: result.paused });
}
