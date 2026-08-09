export type UserSession = {
  id: string;
  name: string;
  orgId: string;
  role: 'owner' | 'editor' | 'viewer';
};

export type Workflow = {
  id: string;
  name: string;
  description?: string;
  workflow_steps: Array<{ id: string; position: number; config: { type: string; [key: string]: any } }>;
  workflow_triggers: Array<{ id: string; trigger_type: string; config: Record<string, any> }>;
  workflow_runs: Array<{ id: string; status: string; paused: boolean; started_at: string }>;
};

export type StepRun = {
  id: string;
  position: number;
  status: string;
  output?: any;
  error?: string;
  step_id: string;
};
