-- 001_init: all core entities. Columns are snake_case versions of the @rj/shared schema fields.
-- JSON columns hold arrays/objects; booleans are INTEGER 0/1; timestamps are ISO-8601 TEXT (UTC);
-- money is INTEGER euro cents. Kept to portable SQL so a PostgreSQL migration set can mirror it.

CREATE TABLE content_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  pillar TEXT NOT NULL,
  template TEXT CHECK (template IN ('A','B','C')),
  series TEXT,
  hook TEXT,
  angle TEXT,
  stage TEXT NOT NULL,
  topic_hash TEXT NOT NULL UNIQUE,
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  current_script_revision_id TEXT,
  current_video_asset_id TEXT,
  current_asset_sha256 TEXT,
  caption_text TEXT,
  caption_hash TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_content_items_stage ON content_items(stage);
CREATE INDEX idx_content_items_scheduled_at ON content_items(scheduled_at);

CREATE TABLE research_briefs (
  id TEXT PRIMARY KEY,
  content_id TEXT REFERENCES content_items(id),
  topic TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_facts TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_research_briefs_content_id ON research_briefs(content_id);
CREATE INDEX idx_research_briefs_status ON research_briefs(status);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  brief_id TEXT REFERENCES research_briefs(id),
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  published_at TEXT,
  accessed_at TEXT NOT NULL,
  trust_tier INTEGER NOT NULL,
  excerpt TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sources_brief_id ON sources(brief_id);

CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  title TEXT NOT NULL,
  current_revision_id TEXT,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_scripts_content_id ON scripts(content_id);

CREATE TABLE script_revisions (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES scripts(id),
  content_id TEXT NOT NULL REFERENCES content_items(id),
  version INTEGER NOT NULL,
  hook TEXT NOT NULL,
  body TEXT NOT NULL,
  cta TEXT,
  on_screen_text TEXT NOT NULL,
  caption_text TEXT,
  sha256 TEXT NOT NULL,
  author_id TEXT NOT NULL,
  change_note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (script_id, version)
);
CREATE INDEX idx_script_revisions_content_id ON script_revisions(content_id);

CREATE TABLE financial_claims (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  script_revision_id TEXT NOT NULL REFERENCES script_revisions(id),
  claim_text TEXT NOT NULL,
  value REAL,
  unit TEXT,
  source_id TEXT REFERENCES sources(id),
  calculation_ref TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_financial_claims_content_id ON financial_claims(content_id);
CREATE INDEX idx_financial_claims_status ON financial_claims(status);

CREATE TABLE fact_checks (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  script_revision_id TEXT NOT NULL REFERENCES script_revisions(id),
  checker_id TEXT NOT NULL,
  verdict TEXT NOT NULL,
  notes TEXT NOT NULL,
  claim_ids TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_fact_checks_content_id ON fact_checks(content_id);

CREATE TABLE compliance_reviews (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  script_revision_id TEXT NOT NULL REFERENCES script_revisions(id),
  reviewer_id TEXT NOT NULL,
  verdict TEXT NOT NULL,
  flags TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_compliance_reviews_content_id ON compliance_reviews(content_id);

CREATE TABLE storyboards (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  script_revision_id TEXT NOT NULL REFERENCES script_revisions(id),
  template TEXT NOT NULL,
  scenes TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_storyboards_content_id ON storyboards(content_id);

CREATE TABLE voice_assets (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  script_revision_id TEXT,
  provider TEXT NOT NULL,
  voice_id TEXT,
  is_fallback INTEGER NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  text_hash TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_voice_assets_content_id ON voice_assets(content_id);
CREATE INDEX idx_voice_assets_text_hash ON voice_assets(text_hash);

CREATE TABLE video_assets (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  script_revision_id TEXT,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_video_assets_content_id ON video_assets(content_id);

CREATE TABLE thumbnail_assets (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  video_asset_id TEXT,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_thumbnail_assets_content_id ON thumbnail_assets(content_id);

CREATE TABLE render_jobs (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  job_id TEXT,
  input_hash TEXT,
  output_path TEXT,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_render_jobs_content_id ON render_jobs(content_id);
CREATE INDEX idx_render_jobs_status ON render_jobs(status);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  gate TEXT NOT NULL CHECK (gate IN ('G1','G2','G3','G4','G5')),
  actor_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  status TEXT NOT NULL,
  script_revision_id TEXT,
  asset_sha256 TEXT,
  caption_hash TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  invalidated_at TEXT,
  invalidation_reason TEXT
);
CREATE INDEX idx_approvals_content_gate ON approvals(content_id, gate);
CREATE INDEX idx_approvals_status ON approvals(status);

CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_at TEXT,
  published_at TEXT,
  external_id TEXT,
  url TEXT,
  video_asset_sha256 TEXT NOT NULL,
  caption_hash TEXT NOT NULL,
  approval_id TEXT NOT NULL REFERENCES approvals(id),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_publications_content_id ON publications(content_id);
CREATE INDEX idx_publications_scheduled_at ON publications(scheduled_at);
CREATE INDEX idx_publications_status ON publications(status);

CREATE TABLE analytics_snapshots (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id),
  content_id TEXT NOT NULL REFERENCES content_items(id),
  captured_at TEXT NOT NULL,
  source TEXT NOT NULL,
  reach REAL,
  views REAL,
  likes REAL,
  comments REAL,
  shares REAL,
  saves REAL,
  follows REAL,
  avg_watch_time_ms REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_analytics_snapshots_content_id ON analytics_snapshots(content_id);
CREATE INDEX idx_analytics_snapshots_publication_id ON analytics_snapshots(publication_id);

CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  content_id TEXT,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT,
  output TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_content_id ON agent_tasks(content_id);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  content_id TEXT,
  workflow TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);

CREATE TABLE error_logs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  content_id TEXT,
  job_id TEXT,
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at);

CREATE TABLE cost_records (
  id TEXT PRIMARY KEY,
  content_id TEXT,
  job_id TEXT,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  units REAL,
  is_estimate INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cost_records_created_at ON cost_records(created_at);
CREATE INDEX idx_cost_records_job_id ON cost_records(job_id);

CREATE TABLE brand_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE system_configuration (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  content_id TEXT,
  action TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_log_content_id ON audit_log(content_id, created_at);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  content_id TEXT,
  payload TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL,
  last_error TEXT,
  result TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX idx_jobs_status_run_after ON jobs(status, run_after);
CREATE INDEX idx_jobs_content_id ON jobs(content_id);
