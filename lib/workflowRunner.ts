import { query } from './db';

type WorkflowStep = {
  id: string;
  position: number;
  config: any;
};

const MAX_STEP_ATTEMPTS = 2;

export async function executeWorkflowRun(runId: string, resumeFromPosition?: number, previousOutput?: any) {
  const runResult = await query('SELECT workflow_id, org_id, status FROM workflow_runs WHERE id = $1', [runId]);
  const run = runResult.rows[0];
  if (!run) throw new Error('Workflow run not found');

  await query('UPDATE workflow_runs SET status = $1, paused = false, updated_at = now() WHERE id = $2', ['running', runId]);

  const stepsResult = await query(
    'SELECT id, position, config FROM workflow_steps WHERE workflow_id = $1 ORDER BY position ASC',
    [run.workflow_id]
  );
  const steps: WorkflowStep[] = stepsResult.rows;

  let index = 0;
  let lastOutput = previousOutput ?? null;
  if (typeof resumeFromPosition === 'number') {
    const resumeIndex = steps.findIndex((step) => step.position === resumeFromPosition);
    index = resumeIndex >= 0 ? resumeIndex : 0;
  }

  while (index < steps.length) {
    const step = steps[index];
    const stepType = step.config.type;
    const stepInput = { previousOutput: lastOutput, config: step.config };

    await insertStepRun(runId, step, stepInput);
    await updateStepRunStatus(runId, step.id, 'running');

    try {
      const output = await executeStepWithRetries(stepType, step.config, lastOutput, runId, step.id);

      if (stepType === 'conditional_branch') {
        const branch = evaluateCondition(step.config.condition, lastOutput);
        const target = branch ? step.config.true_next_position : step.config.false_next_position;
        const finalOutput = { branchTaken: branch ? 'true' : 'false', condition: step.config.condition, previousOutput: lastOutput };
        await completeStepRun(runId, step.id, finalOutput);
        lastOutput = finalOutput;

        if (typeof target === 'number') {
          const targetIndex = steps.findIndex((candidate) => candidate.position === target);
          if (targetIndex !== -1) {
            index = targetIndex;
            continue;
          }
        }
      } else if (stepType === 'approval_gate') {
        await updateStepRunStatus(runId, step.id, 'paused');
        await query('UPDATE workflow_runs SET status = $1, paused = true, updated_at = now() WHERE id = $2', ['paused', runId]);
        return { status: 'paused', paused: true };
      } else {
        await completeStepRun(runId, step.id, output);
        lastOutput = output;
        index += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await query(
        'UPDATE step_runs SET status = $1, output = $2, error = $3, attempt_count = attempt_count + 1, updated_at = now() WHERE workflow_run_id = $4 AND step_id = $5',
        ['failed', { previousOutput: lastOutput }, message, runId, step.id]
      );
      await query('UPDATE workflow_runs SET status = $1, updated_at = now() WHERE id = $2', ['failed', runId]);
      return { status: 'failed', paused: false };
    }
  }

  await query(
    'UPDATE workflow_runs SET status = $1, paused = false, completed_at = now(), updated_at = now() WHERE id = $2',
    ['completed', runId]
  );
  await query('UPDATE organizations SET quota_used = quota_used + 1 WHERE id = $1', [run.org_id]);
  return { status: 'completed', paused: false };
}

export async function resumeWorkflowRun(runId: string, nextPosition: number, previousOutput?: any) {
  await query('UPDATE workflow_runs SET status = $1, paused = false, updated_at = now() WHERE id = $2', ['running', runId]);
  return executeWorkflowRun(runId, nextPosition, previousOutput);
}

async function insertStepRun(runId: string, step: WorkflowStep, input: any) {
  await query(
    'INSERT INTO step_runs (workflow_run_id, step_id, position, status, input) VALUES ($1, $2, $3, $4, $5)',
    [runId, step.id, step.position, 'pending', input]
  );
}

async function updateStepRunStatus(runId: string, stepId: string, status: string) {
  await query('UPDATE step_runs SET status = $1, updated_at = now() WHERE workflow_run_id = $2 AND step_id = $3', [status, runId, stepId]);
}

async function completeStepRun(runId: string, stepId: string, output: any) {
  await query(
    'UPDATE step_runs SET status = $1, output = $2, attempt_count = GREATEST(attempt_count, $3), updated_at = now() WHERE workflow_run_id = $4 AND step_id = $5',
    ['completed', output, 1, runId, stepId]
  );
}

async function executeStepWithRetries(stepType: string, config: any, previousOutput: any, runId: string, stepId: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_STEP_ATTEMPTS; attempt += 1) {
    try {
      if (stepType === 'llm_call') {
        return await performLlmCall(config, previousOutput);
      }
      if (stepType === 'http_request') {
        return await performHttpRequest(config);
      }
      if (stepType === 'db_write') {
        return await performDbWrite(config, runId, stepId, previousOutput);
      }
      if (stepType === 'notify') {
        return await performNotify(config, runId, stepId, previousOutput);
      }
      if (stepType === 'conditional_branch' || stepType === 'approval_gate') {
        return { decision: stepType };
      }
      return { skipped: true };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_STEP_ATTEMPTS) {
        await query('UPDATE step_runs SET attempt_count = attempt_count + 1, updated_at = now() WHERE workflow_run_id = $1 AND step_id = $2', [runId, stepId]);
      }
    }
  }

  throw lastError;
}

function evaluateCondition(condition: any, previousOutput: any) {
  if (!condition || previousOutput == null) return false;
  const actual = Array.isArray(condition.path)
    ? condition.path.reduce((current: any, key: string) => current?.[key], previousOutput)
    : undefined;

  if (condition.operator === 'contains') {
    return typeof actual === 'string' && actual.includes(condition.value);
  }
  if (condition.operator === 'equals') {
    return actual === condition.value;
  }
  return false;
}

async function performLlmCall(config: any, previousOutput: any) {
  const prompt = config.prompt || 'Please generate a small response.';
  await new Promise((resolve) => setTimeout(resolve, 650));
  return {
    text: `Stubbed LLM response for prompt: ${prompt}`,
    metadata: {
      previousOutput,
    },
  };
}

async function performHttpRequest(config: any) {
  const url = config.url;
  if (!url) throw new Error('HTTP request URL is required');
  const method = config.method || 'GET';
  const headers = config.headers || {};
  const body = config.body ? JSON.stringify(config.body) : undefined;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  });

  const data = await response.json().catch(() => ({ status: response.status }));
  if (!response.ok) {
    throw new Error(`HTTP request failed with status ${response.status}`);
  }
  return { status: response.status, data };
}

async function performDbWrite(config: any, runId: string, stepId: string, previousOutput: any) {
  const payload = config.payload ?? { previousOutput, config };
  await query(
    'INSERT INTO workflow_records (workflow_run_id, step_id, payload) VALUES ($1, $2, $3)',
    [runId, stepId, payload]
  );
  return { dbWrite: true, payload };
}

async function performNotify(config: any, runId: string, stepId: string, previousOutput: any) {
  const payload = {
    notification: config.message ?? 'Workflow notification',
    channel: config.channel || 'email',
    previousOutput,
    config,
  };
  await query('INSERT INTO notifications (workflow_run_id, step_id, payload) VALUES ($1, $2, $3)', [runId, stepId, payload]);
  return { notify: true, payload };
}
