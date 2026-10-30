import { z } from 'zod';
import { ActorIdSchema } from './agents.js';
import { GateIdSchema } from './gates.js';
import { PipelineStageSchema } from './stages.js';

/**
 * Zod schemas for every persisted entity. Field names are camelCase here and snake_case in SQL
 * (one column per field; arrays/objects are JSON columns, booleans are INTEGER 0/1).
 * Timestamps are ISO-8601 strings (UTC). Money is integer euro cents. Unknown metrics are null.
 */

const id = z.string().min(1);
const ts = z.string().min(1);
const nullableTs = ts.nullable();
const sha = z.string().regex(/^[a-f0-9]{64}$/, 'expected sha256 hex');
const json = z.unknown();

export const TemplateIdSchema = z.enum(['A', 'B', 'C']);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const ContentIdeaSchema = z.object({
  id,
  title: z.string().min(1),
  pillar: z.string().min(1),
  template: TemplateIdSchema.nullable(),
  series: z.string().nullable(),
  hook: z.string().nullable(),
  angle: z.string().nullable(),
  stage: PipelineStageSchema,
  topicHash: sha,
  priority: z.number().int(),
  scheduledAt: nullableTs,
  currentScriptRevisionId: id.nullable(),
  currentVideoAssetId: id.nullable(),
  currentAssetSha256: sha.nullable(),
  captionText: z.string().nullable(),
  captionHash: sha.nullable(),
  notes: z.string().nullable(),
  createdBy: ActorIdSchema,
  createdAt: ts,
  updatedAt: ts,
});
export type ContentIdea = z.infer<typeof ContentIdeaSchema>;

export const ResearchBriefSchema = z.object({
  id,
  contentId: id.nullable(),
  topic: z.string().min(1),
  kind: z.enum(['evergreen', 'current_news']),
  summary: z.string(),
  keyFacts: z.array(z.string()),
  status: z.enum(['draft', 'approved', 'rejected']),
  createdBy: ActorIdSchema,
  createdAt: ts,
  updatedAt: ts,
});
export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

export const SourceSchema = z.object({
  id,
  briefId: id.nullable(),
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  publishedAt: nullableTs,
  accessedAt: ts,
  trustTier: z.number().int().min(1).max(3),
  excerpt: z.string().nullable(),
  createdAt: ts,
});
export type Source = z.infer<typeof SourceSchema>;

export const ScriptSchema = z.object({
  id,
  contentId: id,
  title: z.string().min(1),
  currentRevisionId: id.nullable(),
  authorId: ActorIdSchema,
  createdAt: ts,
  updatedAt: ts,
});
export type Script = z.infer<typeof ScriptSchema>;

/** Immutable: every change to a script creates a new revision (version n+1). */
export const ScriptRevisionSchema = z.object({
  id,
  scriptId: id,
  contentId: id,
  version: z.number().int().min(1),
  hook: z.string(),
  body: z.string(),
  cta: z.string().nullable(),
  onScreenText: z.array(z.string()),
  captionText: z.string().nullable(),
  sha256: sha,
  authorId: ActorIdSchema,
  changeNote: z.string().nullable(),
  createdAt: ts,
});
export type ScriptRevision = z.infer<typeof ScriptRevisionSchema>;

export const FinancialClaimSchema = z.object({
  id,
  contentId: id,
  scriptRevisionId: id,
  claimText: z.string().min(1),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  sourceId: id.nullable(),
  calculationRef: z.string().nullable(),
  status: z.enum(['unverified', 'verified', 'rejected']),
  createdAt: ts,
});
export type FinancialClaim = z.infer<typeof FinancialClaimSchema>;

export const ReviewVerdictSchema = z.enum(['pass', 'fail', 'needs_revision']);

export const FactCheckSchema = z.object({
  id,
  contentId: id,
  scriptRevisionId: id,
  checkerId: ActorIdSchema,
  verdict: ReviewVerdictSchema,
  notes: z.string(),
  claimIds: z.array(id),
  createdAt: ts,
});
export type FactCheck = z.infer<typeof FactCheckSchema>;

export const ComplianceReviewSchema = z.object({
  id,
  contentId: id,
  scriptRevisionId: id,
  reviewerId: ActorIdSchema,
  verdict: ReviewVerdictSchema,
  flags: z.array(z.string()),
  notes: z.string(),
  createdAt: ts,
});
export type ComplianceReview = z.infer<typeof ComplianceReviewSchema>;

export const StoryboardSchema = z.object({
  id,
  contentId: id,
  scriptRevisionId: id,
  template: TemplateIdSchema,
  scenes: z.array(json),
  createdBy: ActorIdSchema,
  createdAt: ts,
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

export const VoiceAssetSchema = z.object({
  id,
  contentId: id,
  scriptRevisionId: id.nullable(),
  provider: z.string().min(1),
  voiceId: z.string().nullable(),
  /** true when produced by the local fallback (not the brand voice). */
  isFallback: z.boolean(),
  path: z.string().min(1),
  sha256: sha,
  textHash: sha.nullable(),
  durationMs: z.number().int().nullable(),
  createdAt: ts,
});
export type VoiceAsset = z.infer<typeof VoiceAssetSchema>;

export const VideoAssetSchema = z.object({
  id,
  contentId: id,
  scriptRevisionId: id.nullable(),
  path: z.string().min(1),
  sha256: sha,
  durationMs: z.number().int().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  createdBy: ActorIdSchema,
  createdAt: ts,
});
export type VideoAsset = z.infer<typeof VideoAssetSchema>;

export const ThumbnailAssetSchema = z.object({
  id,
  contentId: id,
  videoAssetId: id.nullable(),
  path: z.string().min(1),
  sha256: sha,
  createdAt: ts,
});
export type ThumbnailAsset = z.infer<typeof ThumbnailAssetSchema>;

export const JobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const RenderJobSchema = z.object({
  id,
  contentId: id,
  kind: z.enum(['audio', 'video', 'cover']),
  status: JobStatusSchema,
  jobId: id.nullable(),
  inputHash: sha.nullable(),
  outputPath: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: nullableTs,
  finishedAt: nullableTs,
  createdAt: ts,
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

export const ApprovalSchema = z.object({
  id,
  contentId: id,
  gate: GateIdSchema,
  actorId: ActorIdSchema,
  decision: z.enum(['approved', 'rejected']),
  /** valid = counts toward its gate (if bindings still match); invalidated by a later change. */
  status: z.enum(['valid', 'invalidated']),
  scriptRevisionId: id.nullable(),
  assetSha256: sha.nullable(),
  captionHash: sha.nullable(),
  notes: z.string().nullable(),
  createdAt: ts,
  invalidatedAt: nullableTs,
  invalidationReason: z.string().nullable(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const PublicationSchema = z.object({
  id,
  contentId: id,
  platform: z.string().min(1),
  status: z.enum(['scheduled', 'published', 'failed', 'cancelled']),
  scheduledAt: nullableTs,
  publishedAt: nullableTs,
  externalId: z.string().nullable(),
  url: z.string().nullable(),
  videoAssetSha256: sha,
  captionHash: sha,
  approvalId: id,
  createdBy: ActorIdSchema,
  createdAt: ts,
  updatedAt: ts,
});
export type Publication = z.infer<typeof PublicationSchema>;

const metric = z.number().nonnegative().nullable();
export const AnalyticsSnapshotSchema = z.object({
  id,
  publicationId: id,
  contentId: id,
  capturedAt: ts,
  source: z.enum(['manual', 'api', 'import']),
  reach: metric,
  views: metric,
  likes: metric,
  comments: metric,
  shares: metric,
  saves: metric,
  follows: metric,
  avgWatchTimeMs: metric,
  createdAt: ts,
});
export type AnalyticsSnapshot = z.infer<typeof AnalyticsSnapshotSchema>;

export const AgentTaskSchema = z.object({
  id,
  contentId: id.nullable(),
  agentId: ActorIdSchema,
  kind: z.string().min(1),
  status: JobStatusSchema,
  input: json,
  output: json,
  error: z.string().nullable(),
  createdAt: ts,
  startedAt: nullableTs,
  finishedAt: nullableTs,
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const WorkflowRunSchema = z.object({
  id,
  contentId: id.nullable(),
  workflow: z.string().min(1),
  status: JobStatusSchema,
  error: z.string().nullable(),
  startedAt: ts,
  finishedAt: nullableTs,
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const ErrorLogSchema = z.object({
  id,
  scope: z.string().min(1),
  contentId: id.nullable(),
  jobId: id.nullable(),
  message: z.string().min(1),
  details: json,
  createdAt: ts,
});
export type ErrorLog = z.infer<typeof ErrorLogSchema>;

export const CostRecordSchema = z.object({
  id,
  contentId: id.nullable(),
  jobId: id.nullable(),
  provider: z.string().min(1),
  kind: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  currency: z.literal('EUR'),
  units: z.number().nullable(),
  isEstimate: z.boolean(),
  createdAt: ts,
});
export type CostRecord = z.infer<typeof CostRecordSchema>;

export const BrandAssetSchema = z.object({
  id,
  kind: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  sha256: sha,
  version: z.number().int().min(1),
  createdAt: ts,
});
export type BrandAsset = z.infer<typeof BrandAssetSchema>;

export const SystemConfigurationSchema = z.object({
  key: z.string().min(1),
  value: json,
  updatedBy: ActorIdSchema,
  updatedAt: ts,
});
export type SystemConfiguration = z.infer<typeof SystemConfigurationSchema>;

export const AuditActionSchema = z.enum([
  'transition',
  'transition_denied',
  'approval',
  'approval_denied',
  'invalidation',
  'script_revision',
  'asset_change',
  'caption_change',
  'emergency_stop',
  'publication',
]);
export const AuditLogSchema = z.object({
  id,
  contentId: id.nullable(),
  action: AuditActionSchema,
  fromStage: PipelineStageSchema.nullable(),
  toStage: PipelineStageSchema.nullable(),
  actorId: z.string().min(1),
  reason: z.string(),
  details: json,
  createdAt: ts,
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const JOB_TYPES = [
  'generate_audio',
  'render_video',
  'render_batch',
  'render_cover',
  'media_qa',
  'collect_metrics',
  'daily_brief',
] as const;
export const JobTypeSchema = z.enum(JOB_TYPES);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobSchema = z.object({
  id,
  type: JobTypeSchema,
  idempotencyKey: z.string().min(1),
  contentId: id.nullable(),
  payload: json,
  status: JobStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().min(1),
  timeoutMs: z.number().int().positive(),
  estimatedCostCents: z.number().int().nonnegative(),
  runAfter: ts,
  lastError: z.string().nullable(),
  result: json,
  createdAt: ts,
  startedAt: nullableTs,
  finishedAt: nullableTs,
});
export type Job = z.infer<typeof JobSchema>;
