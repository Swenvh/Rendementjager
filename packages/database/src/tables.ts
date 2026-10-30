import type { z } from 'zod';
import {
  AgentTaskSchema,
  AnalyticsSnapshotSchema,
  ApprovalSchema,
  AuditLogSchema,
  BrandAssetSchema,
  ComplianceReviewSchema,
  ContentIdeaSchema,
  CostRecordSchema,
  ErrorLogSchema,
  FactCheckSchema,
  FinancialClaimSchema,
  JobSchema,
  PublicationSchema,
  RenderJobSchema,
  ResearchBriefSchema,
  ScriptRevisionSchema,
  ScriptSchema,
  SourceSchema,
  StoryboardSchema,
  SystemConfigurationSchema,
  ThumbnailAssetSchema,
  VideoAssetSchema,
  VoiceAssetSchema,
  WorkflowRunSchema,
} from '@rj/shared';

export interface TableSpec<S extends z.ZodObject = z.ZodObject> {
  table: string;
  schema: S;
  pk: string;
  json: readonly string[];
  bool: readonly string[];
}

function spec<S extends z.ZodObject>(
  table: string,
  schema: S,
  opts: { pk?: string; json?: string[]; bool?: string[] } = {},
): TableSpec<S> {
  return { table, schema, pk: opts.pk ?? 'id', json: opts.json ?? [], bool: opts.bool ?? [] };
}

export const TABLES = {
  contentItems: spec('content_items', ContentIdeaSchema),
  researchBriefs: spec('research_briefs', ResearchBriefSchema, { json: ['keyFacts'] }),
  sources: spec('sources', SourceSchema),
  scripts: spec('scripts', ScriptSchema),
  scriptRevisions: spec('script_revisions', ScriptRevisionSchema, { json: ['onScreenText'] }),
  financialClaims: spec('financial_claims', FinancialClaimSchema),
  factChecks: spec('fact_checks', FactCheckSchema, { json: ['claimIds'] }),
  complianceReviews: spec('compliance_reviews', ComplianceReviewSchema, { json: ['flags'] }),
  storyboards: spec('storyboards', StoryboardSchema, { json: ['scenes'] }),
  voiceAssets: spec('voice_assets', VoiceAssetSchema, { bool: ['isFallback'] }),
  videoAssets: spec('video_assets', VideoAssetSchema),
  thumbnailAssets: spec('thumbnail_assets', ThumbnailAssetSchema),
  renderJobs: spec('render_jobs', RenderJobSchema),
  approvals: spec('approvals', ApprovalSchema),
  publications: spec('publications', PublicationSchema),
  analyticsSnapshots: spec('analytics_snapshots', AnalyticsSnapshotSchema),
  agentTasks: spec('agent_tasks', AgentTaskSchema, { json: ['input', 'output'] }),
  workflowRuns: spec('workflow_runs', WorkflowRunSchema),
  errorLogs: spec('error_logs', ErrorLogSchema, { json: ['details'] }),
  costRecords: spec('cost_records', CostRecordSchema, { bool: ['isEstimate'] }),
  brandAssets: spec('brand_assets', BrandAssetSchema),
  systemConfiguration: spec('system_configuration', SystemConfigurationSchema, { pk: 'key', json: ['value'] }),
  auditLog: spec('audit_log', AuditLogSchema, { json: ['details'] }),
  jobs: spec('jobs', JobSchema, { json: ['payload', 'result'] }),
} as const;

export type TableKey = keyof typeof TABLES;
export type RowOf<K extends TableKey> = z.infer<(typeof TABLES)[K]['schema']>;

export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}
