import { GraphQLClient } from 'graphql-request';

const endpoint = process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';

export function createHasuraClient(headers: Record<string, string> = {}) {
  return new GraphQLClient(endpoint, {
    headers,
  });
}

export const workflowsQuery = `
query OrgWorkflows($orgId: uuid!) {
  workflows(where: {org_id: {_eq: $orgId}}) {
    id
    name
    description
    workflow_steps(order_by: {position: asc}) {
      id
      position
      config
    }
    workflow_triggers {
      id
      trigger_type
      config
    }
    workflow_runs(order_by: {started_at: desc}, limit: 1) {
      id
      status
      paused
      started_at
    }
  }
}
`;

export const workflowStepRunsSubscription = `
subscription StepRuns($workflowRunId: uuid!) {
  step_runs(where: {workflow_run_id: {_eq: $workflowRunId}}, order_by: {position: asc}) {
    id
    step_id
    position
    status
    output
    error
    updated_at
  }
}
`;

export const createWorkflowMutation = `
mutation CreateWorkflow($orgId: uuid!, $name: String!, $description: String, $steps: [workflow_steps_insert_input!]!, $triggers: [workflow_triggers_insert_input!]!) {
  insert_workflows_one(object: {
    org_id: $orgId,
    name: $name,
    description: $description,
    workflow_steps: { data: $steps },
    workflow_triggers: { data: $triggers }
  }) {
    id
    name
  }
}
`;
