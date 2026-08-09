import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { executeWorkflowRun } from '@/lib/workflowRunner';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const workflowId = body.input?.workflow_id || body.workflow_id;
  const userId = req.headers.get('x-hasura-user-id');
  const role = req.headers.get('x-hasura-role');

  if (!workflowId || !userId || !role) {
    return NextResponse.json({ error: 'Missing workflow_id or auth headers' }, { status: 400 });
  }

  const workflowResult = await query(
    `SELECT w.id, w.org_id, o.quota_used, o.quota_allowed
     FROM workflows w
     JOIN organizations o ON o.id = w.org_id
     WHERE w.id = $1`,
    [workflowId]
  );
  const workflow = workflowResult.rows[0];
  if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });

  const membershipResult = await query(
    `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
    [workflow.org_id, userId]
  );
  const membership = membershipResult.rows[0];
  if (!membership || !['owner', 'editor'].includes(membership.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (workflow.quota_used >= workflow.quota_allowed) {
    return NextResponse.json({ error: 'Quota exhausted' }, { status: 402 });
  }

  const insertResult = await query(
    `INSERT INTO workflow_runs (workflow_id, org_id, status, paused) VALUES ($1, $2, 'running', false) RETURNING id`,
    [workflowId, workflow.org_id]
  );
  const runId = insertResult.rows[0].id;
  const result = await executeWorkflowRun(runId);
  return NextResponse.json({ workflow_run_id: runId, status: result.status, paused: result.paused });
}
