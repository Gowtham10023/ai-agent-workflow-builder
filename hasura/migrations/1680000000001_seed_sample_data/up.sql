INSERT INTO organizations (id, name, quota_allowed, quota_used) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'Org A', 10, 0),
  ('00000000-0000-0000-0000-00000000000b', 'Org B', 10, 0)
ON CONFLICT DO NOTHING;

INSERT INTO org_members (org_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'org-a-owner', 'owner'),
  ('00000000-0000-0000-0000-00000000000a', 'org-a-editor', 'editor'),
  ('00000000-0000-0000-0000-00000000000a', 'org-a-viewer', 'viewer'),
  ('00000000-0000-0000-0000-00000000000b', 'org-b-owner', 'owner'),
  ('00000000-0000-0000-0000-00000000000b', 'org-b-viewer', 'viewer')
ON CONFLICT DO NOTHING;

INSERT INTO workflows (id, org_id, name, description) VALUES
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Org A Sample Workflow', 'A sample Org A workflow demonstrating llm_call, http_request, conditional branch, and approval gate.'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Org B Sample Workflow', 'Org B workflow for testing cross-org isolation.')
ON CONFLICT DO NOTHING;

INSERT INTO workflow_steps (workflow_id, position, config) VALUES
  ('10000000-0000-0000-0000-00000000000a', 1, '{"type":"llm_call","prompt":"Summarize the latest update and decide if approval is needed."}'),
  ('10000000-0000-0000-0000-00000000000a', 2, '{"type":"http_request","url":"https://jsonplaceholder.typicode.com/todos/1","method":"GET"}'),
  ('10000000-0000-0000-0000-00000000000a', 3, '{"type":"conditional_branch","condition":{"path":["text"],"operator":"contains","value":"approval"},"true_next_position":4,"false_next_position":6}'),
  ('10000000-0000-0000-0000-00000000000a', 4, '{"type":"approval_gate"}'),
  ('10000000-0000-0000-0000-00000000000a', 5, '{"type":"llm_call","prompt":"The workflow continued after approval."}'),
  ('10000000-0000-0000-0000-00000000000a', 6, '{"type":"db_write","payload":{"note":"Approved workflow branch completed.","source":"workflow"}}'),
  ('10000000-0000-0000-0000-00000000000a', 7, '{"type":"notify","message":"Workflow finished either post-approval or direct branch.","channel":"slack"}'),
  ('10000000-0000-0000-0000-00000000000b', 1, '{"type":"llm_call","prompt":"Org B simple step."}')
ON CONFLICT DO NOTHING;

INSERT INTO workflow_triggers (workflow_id, trigger_type, config) VALUES
  ('10000000-0000-0000-0000-00000000000a', 'manual', '{}'),
  ('10000000-0000-0000-0000-00000000000a', 'webhook', '{"path":"/org-a-sample"}'),
  ('10000000-0000-0000-0000-00000000000b', 'manual', '{}')
ON CONFLICT DO NOTHING;
