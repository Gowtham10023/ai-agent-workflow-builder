'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createHasuraClient, workflowsQuery, workflowStepRunsSubscription, createWorkflowMutation } from '@/lib/hasuraClient';
import type { UserSession, Workflow, StepRun } from '@/lib/types';
import { createClient } from 'graphql-ws';

const users: UserSession[] = [
  { id: 'org-a-owner', name: 'Org A Owner', orgId: '00000000-0000-0000-0000-00000000000a', role: 'owner' },
  { id: 'org-a-editor', name: 'Org A Editor', orgId: '00000000-0000-0000-0000-00000000000a', role: 'editor' },
  { id: 'org-a-viewer', name: 'Org A Viewer', orgId: '00000000-0000-0000-0000-00000000000a', role: 'viewer' },
  { id: 'org-b-owner', name: 'Org B Owner', orgId: '00000000-0000-0000-0000-00000000000b', role: 'owner' },
  { id: 'org-b-viewer', name: 'Org B Viewer', orgId: '00000000-0000-0000-0000-00000000000b', role: 'viewer' },
];

const webhookPayload = `POST http://localhost:3000/api/webhook/org-a-sample

{
  "workflow_id": "<WORKFLOW_ID>"
}`;

export default function HomePage() {
  const [user, setUser] = useState<UserSession>(users[0]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [stepRuns, setStepRuns] = useState<StepRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const subscriptionRef = useRef<any>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [pausedStepId, setPausedStepId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('New workflow');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('Describe the workflow.');
  const [newSteps, setNewSteps] = useState<Array<{ type: string; config: string }>>([
    { type: 'llm_call', config: '{"type":"llm_call","prompt":"Generate a summary."}' },
  ]);
  const [newTriggers, setNewTriggers] = useState<Array<{ trigger_type: string; config: string }>>([
    { trigger_type: 'manual', config: '{}' },
  ]);

  const client = useMemo(() => createHasuraClient({
    'x-hasura-user-id': user.id,
    'x-hasura-role': user.role,
    'x-hasura-org-id': user.orgId,
  }), [user]);

  useEffect(() => {
    fetchWorkflows();
    return () => {
      subscriptionRef.current?.unsubscribe?.();
    };
  }, [user]);

  async function fetchWorkflows() {
    setLoading(true);
    setError(null);
    try {
      const data = await client.request<{ workflows: Workflow[] }>(workflowsQuery, { orgId: user.orgId });
      setWorkflows(data.workflows);
      setSelectedWorkflowId(data.workflows[0]?.id ?? null);
    } catch (err) {
      setError('Unable to load workflows.');
    } finally {
      setLoading(false);
    }
  }

  async function startRun(workflowId: string) {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/hasura/action/triggerWorkflowRun', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-user-id': user.id,
          'x-hasura-role': user.role,
          'x-hasura-org-id': user.orgId,
        },
        body: JSON.stringify({ workflow_id: workflowId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start run');
      setRunStatus(`Run started: ${data.status}`);
      subscribeStepRuns(data.workflow_run_id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function subscribeStepRuns(workflowRunId: string) {
    subscriptionRef.current?.unsubscribe?.();
    const ws = createClient({
      url: (process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql').replace(/^http/, 'ws'),
      connectionParams: {
        headers: {
          'x-hasura-user-id': user.id,
          'x-hasura-role': user.role,
          'x-hasura-org-id': user.orgId,
        },
      },
    });

    subscriptionRef.current = ws.subscribe(
      {
        query: workflowStepRunsSubscription,
        variables: { workflowRunId },
      },
      {
        next: (result: any) => {
          if (result.data?.step_runs) {
            setStepRuns(result.data.step_runs);
            const paused = result.data.step_runs.find((step: StepRun) => step.status === 'paused');
            setPausedStepId(paused?.id ?? null);
          }
          if (result.errors) {
            setError('Subscription error');
          }
        },
        error: (err) => setError(String(err)),
        complete: () => {
          setRunStatus('Subscription completed');
        },
      }
    );
  }

  async function approvePausedStep() {
    if (!pausedStepId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/hasura/action/approveStep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-user-id': user.id,
          'x-hasura-role': user.role,
          'x-hasura-org-id': user.orgId,
        },
        body: JSON.stringify({ step_run_id: pausedStepId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Approval failed');
      setRunStatus(data.status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function addStep() {
    setNewSteps((current) => [
      ...current,
      { type: 'llm_call', config: '{"type":"llm_call","prompt":"Tell me something."}' },
    ]);
  }

  function addTrigger() {
    setNewTriggers((current) => [
      ...current,
      { trigger_type: 'manual', config: '{}' },
    ]);
  }

  function updateStep(index: number, field: 'type' | 'config', value: string) {
    setNewSteps((current) => current.map((step, i) => (i === index ? { ...step, [field]: value } : step)));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setNewSteps((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function createWorkflow() {
    setLoading(true);
    setError(null);
    try {
      const steps = newSteps.map((step, index) => ({
        position: index + 1,
        config: JSON.parse(step.config),
      }));
      const triggers = newTriggers.map((trigger) => ({
        trigger_type: trigger.trigger_type,
        config: JSON.parse(trigger.config),
      }));
      const data = await client.request(createWorkflowMutation, {
        orgId: user.orgId,
        name: newWorkflowName,
        description: newWorkflowDescription,
        steps,
        triggers,
      }) as { insert_workflows_one: { id: string; name: string } };
      setRunStatus(`Created workflow: ${data.insert_workflows_one.name}`);
      setIsCreating(false);
      fetchWorkflows();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId);

  return (
    <main className="container">
      <div className="section card">
        <h1>AI Agent Workflow Builder</h1>
        <p>Signed in as <strong>{user.name}</strong> ({user.role})</p>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="user-select">Switch user:</label>{' '}
          <select id="user-select" value={user.id} onChange={(event) => {
            const selected = users.find((entry) => entry.id === event.target.value);
            if (selected) setUser(selected);
          }}>
            {users.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="section card">
        <h2>Workflows</h2>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {workflows.length === 0 && !loading && <p>No workflows found for this organization.</p>}
        <div style={{ display: 'grid', gap: 16 }}>
          {workflows.map((workflow) => {
            const lastRun = workflow.workflow_runs[0];
            return (
              <div key={workflow.id} className="card">
                <h3>{workflow.name}</h3>
                <p>{workflow.description}</p>
                <p>
                  Last run: <strong>{lastRun?.status ?? 'never'}</strong>{' '}
                  {lastRun?.paused ? '(paused)' : ''}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="button-primary" onClick={() => { setSelectedWorkflowId(workflow.id); }}>
                    Select
                  </button>
                  {user.role !== 'viewer' && (
                    <button className="button-secondary" onClick={() => startRun(workflow.id)}>
                      Run workflow
                    </button>
                  )}
                </div>
                {workflow.workflow_triggers.length > 0 && (
                  <p>Triggers: {workflow.workflow_triggers.map((trigger) => trigger.trigger_type).join(', ')}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {(user.role === 'owner' || user.role === 'editor') && (
        <div className="section card">
          <h2>Build a workflow</h2>
          <button className="button-primary" onClick={() => setIsCreating((value) => !value)}>
            {isCreating ? 'Hide builder' : 'Open builder'}
          </button>
          {isCreating && (
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Workflow name</label>
                <input
                  type="text"
                  value={newWorkflowName}
                  onChange={(event) => setNewWorkflowName(event.target.value)}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Description</label>
                <textarea
                  value={newWorkflowDescription}
                  onChange={(event) => setNewWorkflowDescription(event.target.value)}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <h3>Steps</h3>
                {newSteps.map((step, index) => (
                  <div key={`${step.type}-${index}`} style={{ marginBottom: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <label>Type</label>
                      <select value={step.type} onChange={(event) => updateStep(index, 'type', event.target.value)}>
                        <option value="llm_call">llm_call</option>
                        <option value="http_request">http_request</option>
                        <option value="conditional_branch">conditional_branch</option>
                        <option value="approval_gate">approval_gate</option>
                        <option value="db_write">db_write</option>
                        <option value="notify">notify</option>
                      </select>
                      <button className="button-secondary" onClick={() => moveStep(index, -1)} disabled={index === 0}>
                        Up
                      </button>
                      <button className="button-secondary" onClick={() => moveStep(index, 1)} disabled={index === newSteps.length - 1}>
                        Down
                      </button>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: 'block', marginBottom: 4 }}>Config (JSON)</label>
                      <textarea
                        value={step.config}
                        onChange={(event) => updateStep(index, 'config', event.target.value)}
                        rows={4}
                        style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
                      />
                    </div>
                  </div>
                ))}
                <button className="button-secondary" onClick={addStep}>Add step</button>
              </div>
              <div style={{ marginBottom: 12 }}>
                <h3>Triggers</h3>
                {newTriggers.map((trigger, index) => (
                  <div key={`${trigger.trigger_type}-${index}`} style={{ marginBottom: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label>Trigger</label>
                      <select
                        value={trigger.trigger_type}
                        onChange={(event) => setNewTriggers((current) => current.map((item, i) => (i === index ? { ...item, trigger_type: event.target.value } : item)))}
                      >
                        <option value="manual">manual</option>
                        <option value="webhook">webhook</option>
                      </select>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: 'block', marginBottom: 4 }}>Config (JSON)</label>
                      <textarea
                        value={trigger.config}
                        onChange={(event) => setNewTriggers((current) => current.map((item, i) => (i === index ? { ...item, config: event.target.value } : item)))}
                        rows={3}
                        style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
                      />
                    </div>
                  </div>
                ))}
                <button className="button-secondary" onClick={addTrigger}>Add trigger</button>
              </div>
              <button className="button-primary" onClick={createWorkflow}>Create workflow</button>
            </div>
          )}
        </div>
      )}

      {selectedWorkflow && (
        <div className="section card">
          <h2>Selected workflow: {selectedWorkflow.name}</h2>
          <p>{selectedWorkflow.description}</p>
          <div>
            <strong>Steps</strong>
            <ol>
              {selectedWorkflow.workflow_steps.map((step) => (
                <li key={step.id}>{step.config.type} - {JSON.stringify(step.config)}</li>
              ))}
            </ol>
          </div>
          <div>
            <strong>Live run</strong>
            {runStatus && <p>Status: {runStatus}</p>}
            <div>
              {stepRuns.map((stepRun) => (
                <div key={stepRun.id} style={{ marginBottom: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <p><strong>Step {stepRun.position}</strong> {stepRun.step_id}</p>
                  <p>Status: <span className={`status-pill status-${stepRun.status}`}>{stepRun.status}</span></p>
                  {stepRun.output && <pre>{JSON.stringify(stepRun.output, null, 2)}</pre>}
                  {stepRun.error && <p style={{ color: 'red' }}>{stepRun.error}</p>}
                </div>
              ))}
            </div>
            {pausedStepId && user.role !== 'viewer' && (
              <button className="button-primary" onClick={approvePausedStep}>Approve paused step</button>
            )}
          </div>
        </div>
      )}

      <div className="section card">
        <h2>Webhook trigger example</h2>
        <p>Use this payload in your external system. Replace <code>&lt;WORKFLOW_ID&gt;</code> with a selected workflow ID.</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f3f4f6', padding: 12, borderRadius: 10 }}>{webhookPayload}</pre>
      </div>
    </main>
  );
}
