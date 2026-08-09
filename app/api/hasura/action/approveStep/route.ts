import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resumeWorkflowRun } from '@/lib/workflowRunner';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const stepRunId = body.input?.step_run_id || body.step_run_id;
  const userId = req.headers.get('x-hasura-user-id');
  const role = req.headers.get('x-hasura-role');

  if (!stepRunId || !userId || !role) {
    return NextResponse.json({ error: 'Missing step_run_id or auth headers' }, { status: 400 });
  }

  const stepResult = await query(
    `SELECT sr.id, sr.status, sr.position, sr.workflow_run_id, sr.output, ws.config->>'type' AS step_type, wr.org_id
     FROM step_runs sr
     JOIN workflow_steps ws ON ws.id = sr.step_id
     JOIN workflow_runs wr ON wr.id = sr.workflow_run_id
     WHERE sr.id = $1`,
    [stepRunId]
  );
  const stepRun = stepResult.rows[0];
  if (!stepRun) return NextResponse.json({ error: 'Step run not found' }, { status: 404 });
  if (stepRun.step_type !== 'approval_gate' || stepRun.status !== 'paused') {
    return NextResponse.json({ error: 'Step is not awaiting approval' }, { status: 400 });
  }

  const membershipResult = await query(
    `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
    [stepRun.org_id, userId]
  );
  const membership = membershipResult.rows[0];
  if (!membership || !['owner', 'editor'].includes(membership.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await query(
    `UPDATE step_runs SET status = $1, approved_by = $2, approved_at = now(), output = $3, updated_at = now() WHERE id = $4`,
    ['completed', userId, { approved: true, approvedBy: userId, previousOutput: stepRun.output }, stepRunId]
  );
  await query(`UPDATE workflow_runs SET status = $1, paused = false, updated_at = now() WHERE id = $2`, ['running', stepRun.workflow_run_id]);

  const resumeResult = await resumeWorkflowRun(stepRun.workflow_run_id, stepRun.position + 1, stepRun.output ?? null);
  return NextResponse.json({ workflow_run_id: stepRun.workflow_run_id, status: resumeResult.status, resumed: !resumeResult.paused });
}
