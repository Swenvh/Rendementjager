import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Repository } from '@rj/database';
import {
  type ActorId,
  ActorIdSchema,
  type Approval,
  type AuditLog,
  type ContentIdea,
  GATE_IDS,
  GATES,
  type GateId,
  type PipelineStage,
  PipelineStageSchema,
  type Publication,
  type ScriptRevision,
  type TemplateId,
  type VideoAsset,
  captionHash as hashCaption,
  isTransitionAllowed,
  newId,
  normalizeText,
  requiredGatesFor,
  sha256,
  topicHash,
} from '@rj/shared';

export type WorkflowErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INVALID_ACTOR'
  | 'INVALID_TRANSITION'
  | 'GATE_NOT_SATISFIED'
  | 'EMERGENCY_STOP'
  | 'NOT_AUTHORIZED'
  | 'BINDING_MISMATCH'
  | 'SELF_REVIEW'
  | 'DUPLICATE_TOPIC'
  | 'ALREADY_PUBLISHED';

export class WorkflowError extends Error {
  constructor(
    readonly code: WorkflowErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

/** Actors allowed to move an item to SCHEDULED / PUBLISHED (G5 by the owner is still required). */
export const PUBLISHING_ACTORS: readonly ActorId[] = ['owner', 'distribution-manager', 'automation-engineer', 'chief-of-staff'];

/** Stages from which a changed asset/caption demotes the item (G5 no longer valid). */
const POST_RENDER_STAGES: readonly PipelineStage[] = ['RENDERED', 'QA_REVIEW', 'READY_FOR_EDITOR', 'APPROVED_FOR_PUBLISHING', 'SCHEDULED'];

export interface ApprovalBinding {
  scriptRevisionId?: string;
  assetSha256?: string;
  captionHash?: string;
}

export interface RecordApprovalOptions extends ApprovalBinding {
  decision?: 'approved' | 'rejected';
  notes?: string;
}

export interface GateState {
  gate: GateId;
  satisfied: boolean;
  approvalIds: string[];
  reason: string;
}

export interface TransitionCheck {
  allowed: boolean;
  reasons: string[];
  code: WorkflowErrorCode | null;
}

export interface WorkflowServiceOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface NewContentIdea {
  title: string;
  pillar: string;
  template?: TemplateId | null;
  series?: string | null;
  hook?: string | null;
  angle?: string | null;
  priority?: number;
  notes?: string | null;
}

export interface NewScriptRevision {
  hook: string;
  body: string;
  cta?: string | null;
  onScreenText?: string[];
  captionText?: string | null;
  changeNote?: string | null;
  title?: string;
}

export interface NewVideoAsset {
  path: string;
  sha256: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  scriptRevisionId?: string | null;
}

export interface SchedulePublicationInput {
  platform: string;
  scheduledAt: string;
  /** sha256 recomputed from the exact file about to be sent (or pass filePath to hash it here). */
  assetSha256?: string;
  filePath?: string;
  /** Hash of the caption about to be sent (or pass captionText). */
  captionHash?: string;
  captionText?: string;
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest('hex');
}

/**
 * The only sanctioned way to move content through the pipeline. Enforces the transition map,
 * gates G1–G5 (bound to script revision / asset sha256 / caption hash), approval invalidation,
 * separation of duties and the emergency stop. Every transition, approval, invalidation and
 * denied attempt is written to `audit_log`.
 */
export class WorkflowService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;

  constructor(
    private readonly repo: Repository,
    options: WorkflowServiceOptions = {},
  ) {
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date());
  }

  private ts(): string {
    return this.now().toISOString();
  }

  private actor(actor: string): ActorId {
    const parsed = ActorIdSchema.safeParse(actor);
    if (!parsed.success) throw new WorkflowError('INVALID_ACTOR', `Unknown actor "${actor}"`);
    return parsed.data;
  }

  private async item(repo: Repository, contentId: string): Promise<ContentIdea> {
    const item = await repo.contentItems.get(contentId);
    if (!item) throw new WorkflowError('NOT_FOUND', `Content item ${contentId} not found`);
    return item;
  }

  private async audit(repo: Repository, row: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
    await repo.auditLog.insert({ ...row, id: newId('al'), createdAt: this.ts() });
  }

  // ---------------------------------------------------------------- emergency stop

  async isEmergencyStopped(repo: Repository = this.repo): Promise<boolean> {
    return isEmergencyStopActive(repo, this.env);
  }

  /** Any agent may switch the stop ON; only the owner may switch it OFF. */
  async setEmergencyStop(on: boolean, actorId: string, reason: string): Promise<void> {
    const actor = this.actor(actorId);
    if (!on && actor !== 'owner') throw new WorkflowError('NOT_AUTHORIZED', 'Only the owner can lift the emergency stop');
    if (!reason.trim()) throw new WorkflowError('INVALID_INPUT', 'reason is required');
    await this.repo.transaction(async (tx) => {
      await tx.setConfig('emergency_stop', on, actor);
      await this.audit(tx, {
        contentId: null,
        action: 'emergency_stop',
        fromStage: null,
        toStage: null,
        actorId: actor,
        reason,
        details: { on },
      });
    });
  }

  // ---------------------------------------------------------------- content

  async createContentIdea(input: NewContentIdea, actorId: string): Promise<ContentIdea> {
    const actor = this.actor(actorId);
    if (!input.title?.trim() || !input.pillar?.trim()) throw new WorkflowError('INVALID_INPUT', 'title and pillar are required');
    const hash = topicHash(input.title);
    return this.repo.transaction(async (tx) => {
      const dup = await tx.contentItems.first({ topicHash: hash });
      if (dup) throw new WorkflowError('DUPLICATE_TOPIC', `Topic already exists: "${dup.title}"`, { existingId: dup.id });
      const now = this.ts();
      const item = await tx.contentItems.insert({
        id: newId('ci'),
        title: input.title.trim(),
        pillar: input.pillar.trim(),
        template: input.template ?? null,
        series: input.series ?? null,
        hook: input.hook ?? null,
        angle: input.angle ?? null,
        stage: 'IDEA',
        topicHash: hash,
        priority: input.priority ?? 0,
        scheduledAt: null,
        currentScriptRevisionId: null,
        currentVideoAssetId: null,
        currentAssetSha256: null,
        captionText: null,
        captionHash: null,
        notes: input.notes ?? null,
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      });
      await this.audit(tx, { contentId: item.id, action: 'transition', fromStage: null, toStage: 'IDEA', actorId: actor, reason: 'created', details: null });
      return item;
    });
  }

  // ---------------------------------------------------------------- gates

  private async gateStateIn(repo: Repository, item: ContentIdea, gate: GateId): Promise<GateState> {
    const def = GATES[gate];
    const all = await repo.approvals.list({ contentId: item.id, gate, status: 'valid' }, { orderBy: 'createdAt' });
    const matching = all.filter((a) => {
      if (def.binding === 'scriptRevision') return item.currentScriptRevisionId !== null && a.scriptRevisionId === item.currentScriptRevisionId;
      if (def.binding === 'asset') return item.currentAssetSha256 !== null && a.assetSha256 === item.currentAssetSha256;
      if (def.binding === 'assetAndCaption')
        return (
          item.currentAssetSha256 !== null &&
          item.captionHash !== null &&
          a.assetSha256 === item.currentAssetSha256 &&
          a.captionHash === item.captionHash &&
          a.actorId === 'owner'
        );
      return true;
    });
    // Latest decision per actor wins; any current rejection blocks the gate.
    const latestByActor = new Map<string, Approval>();
    for (const a of matching) latestByActor.set(a.actorId, a);
    const latest = [...latestByActor.values()];
    const approved = latest.filter((a) => a.decision === 'approved');
    const state = (satisfied: boolean, reason: string): GateState => ({
      gate,
      satisfied,
      approvalIds: satisfied ? approved.map((a) => a.id) : [],
      reason,
    });
    if (latest.some((a) => a.decision === 'rejected')) return state(false, `${gate} rejected`);
    if (approved.length === 0) {
      const reason =
        all.length > 0 ? `${gate} approval does not match the current ${bindingLabel(def.binding)}` : `${gate} not approved yet`;
      return state(false, reason);
    }
    if (gate === 'G3') {
      const has = (role: ActorId) => approved.some((a) => a.actorId === role || a.actorId === 'owner');
      if (!has('fact-checker')) return state(false, 'G3 needs a fact-checker (or owner) approval');
      if (!has('compliance-reviewer')) return state(false, 'G3 needs a compliance-reviewer (or owner) approval');
    }
    return state(true, `${gate} satisfied`);
  }

  async gateStatus(contentId: string): Promise<Record<GateId, GateState>> {
    const item = await this.item(this.repo, contentId);
    const out = {} as Record<GateId, GateState>;
    for (const g of GATE_IDS) out[g] = await this.gateStateIn(this.repo, item, g);
    return out;
  }

  // ---------------------------------------------------------------- transitions

  private async checkIn(repo: Repository, item: ContentIdea, to: PipelineStage, actor: ActorId): Promise<TransitionCheck> {
    const fail = (code: WorkflowErrorCode, ...reasons: string[]): TransitionCheck => ({ allowed: false, reasons, code });
    if (!isTransitionAllowed(item.stage, to)) return fail('INVALID_TRANSITION', `${item.stage} -> ${to} is not an allowed transition`);
    if (to !== 'FAILED' && to !== 'ARCHIVED' && (await this.isEmergencyStopped(repo)))
      return fail('EMERGENCY_STOP', 'Emergency stop is active: only FAILED or ARCHIVED are allowed');
    if ((to === 'SCHEDULED' || to === 'PUBLISHED') && !PUBLISHING_ACTORS.includes(actor))
      return fail('NOT_AUTHORIZED', `${actor} may not move content to ${to}`);
    const reasons: string[] = [];
    for (const gate of requiredGatesFor(to)) {
      const s = await this.gateStateIn(repo, item, gate);
      if (!s.satisfied) reasons.push(s.reason);
    }
    if (reasons.length) return fail('GATE_NOT_SATISFIED', ...reasons);
    return { allowed: true, reasons: [], code: null };
  }

  /** Dry run for UIs: would this transition be allowed right now? */
  async canTransition(contentId: string, toStage: PipelineStage, actorId: string): Promise<TransitionCheck> {
    const actor = this.actor(actorId);
    const to = PipelineStageSchema.parse(toStage);
    return this.checkIn(this.repo, await this.item(this.repo, contentId), to, actor);
  }

  private async transitionIn(
    tx: Repository,
    contentId: string,
    to: PipelineStage,
    actor: ActorId,
    reason: string,
    extra: Partial<ContentIdea> = {},
  ): Promise<ContentIdea> {
    const item = await this.item(tx, contentId);
    const check = await this.checkIn(tx, item, to, actor);
    if (!check.allowed)
      throw new WorkflowError(check.code ?? 'INVALID_TRANSITION', check.reasons.join('; '), { from: item.stage, to, reasons: check.reasons });
    const updated = await tx.contentItems.update(contentId, { ...extra, stage: to, updatedAt: this.ts() });
    await this.audit(tx, { contentId, action: 'transition', fromStage: item.stage, toStage: to, actorId: actor, reason, details: null });
    return updated;
  }

  async transition(contentId: string, toStage: PipelineStage, actorId: string, reason: string): Promise<ContentIdea> {
    const actor = this.actor(actorId);
    const to = PipelineStageSchema.safeParse(toStage);
    if (!to.success) throw new WorkflowError('INVALID_INPUT', `Unknown stage "${String(toStage)}"`);
    if (!reason?.trim()) throw new WorkflowError('INVALID_INPUT', 'reason is required');
    try {
      return await this.repo.transaction((tx) => this.transitionIn(tx, contentId, to.data, actor, reason));
    } catch (err) {
      if (err instanceof WorkflowError && err.code !== 'NOT_FOUND') {
        const item = await this.repo.contentItems.get(contentId);
        await this.audit(this.repo, {
          contentId,
          action: 'transition_denied',
          fromStage: item?.stage ?? null,
          toStage: to.data,
          actorId: actor,
          reason: `${reason} — denied: ${err.message}`,
          details: { code: err.code },
        });
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------- approvals

  async recordApproval(gate: GateId, contentId: string, actorId: string, options: RecordApprovalOptions = {}): Promise<Approval> {
    const actor = this.actor(actorId);
    const def = GATES[gate];
    if (!def) throw new WorkflowError('INVALID_INPUT', `Unknown gate "${String(gate)}"`);
    const decision = options.decision ?? 'approved';
    try {
      return await this.repo.transaction(async (tx) => {
        const item = await this.item(tx, contentId);
        if (!(def.approvers as readonly string[]).includes(actor))
          throw new WorkflowError('NOT_AUTHORIZED', `${actor} may not decide ${gate} (allowed: ${def.approvers.join(', ')})`);
        if (decision === 'rejected' && !options.notes?.trim())
          throw new WorkflowError('INVALID_INPUT', 'A rejection needs notes with the reasons');

        let scriptRevisionId: string | null = null;
        let assetSha256: string | null = null;
        let capHash: string | null = null;

        if (def.binding === 'none') {
          const briefs = await tx.researchBriefs.count({ contentId, status: { op: 'ne', value: 'rejected' } });
          if (briefs === 0 && decision === 'approved') throw new WorkflowError('INVALID_INPUT', 'G1 needs a research brief for this content');
        }
        if (def.binding === 'scriptRevision') {
          if (!options.scriptRevisionId) throw new WorkflowError('INVALID_INPUT', `${gate} must name the scriptRevisionId it approves`);
          if (options.scriptRevisionId !== item.currentScriptRevisionId)
            throw new WorkflowError('BINDING_MISMATCH', `${gate} must be given on the current script revision`, {
              current: item.currentScriptRevisionId,
              given: options.scriptRevisionId,
            });
          const rev = await tx.scriptRevisions.get(options.scriptRevisionId);
          if (!rev) throw new WorkflowError('NOT_FOUND', 'script revision not found');
          if (def.approverMustNotBeAuthor && rev.authorId === actor)
            throw new WorkflowError('SELF_REVIEW', `${actor} wrote this script revision and may not decide ${gate}`);
          scriptRevisionId = rev.id;
        }
        if (def.binding === 'asset' || def.binding === 'assetAndCaption') {
          if (!options.assetSha256) throw new WorkflowError('INVALID_INPUT', `${gate} must name the assetSha256 it approves`);
          if (!item.currentAssetSha256 || options.assetSha256 !== item.currentAssetSha256)
            throw new WorkflowError('BINDING_MISMATCH', `${gate} asset hash does not match the current video asset`);
          assetSha256 = options.assetSha256;
        }
        if (def.binding === 'assetAndCaption') {
          if (!options.captionHash) throw new WorkflowError('INVALID_INPUT', `${gate} must name the captionHash it approves`);
          if (!item.captionHash || options.captionHash !== item.captionHash)
            throw new WorkflowError('BINDING_MISMATCH', `${gate} caption hash does not match the current caption`);
          capHash = options.captionHash;
        }

        const approval = await tx.approvals.insert({
          id: newId('ap'),
          contentId,
          gate,
          actorId: actor,
          decision,
          status: 'valid',
          scriptRevisionId,
          assetSha256,
          captionHash: capHash,
          notes: options.notes ?? null,
          createdAt: this.ts(),
          invalidatedAt: null,
          invalidationReason: null,
        });
        await this.audit(tx, {
          contentId,
          action: 'approval',
          fromStage: item.stage,
          toStage: null,
          actorId: actor,
          reason: `${gate} ${decision}${options.notes ? `: ${options.notes}` : ''}`,
          details: { approvalId: approval.id, gate, decision, scriptRevisionId, assetSha256, captionHash: capHash },
        });
        if (decision === 'rejected' && gate !== 'G1' && isTransitionAllowed(item.stage, 'REVISION_REQUIRED')) {
          await tx.contentItems.update(contentId, { stage: 'REVISION_REQUIRED', updatedAt: this.ts() });
          await this.audit(tx, {
            contentId,
            action: 'transition',
            fromStage: item.stage,
            toStage: 'REVISION_REQUIRED',
            actorId: actor,
            reason: `automatic: ${gate} rejected — ${options.notes}`,
            details: { approvalId: approval.id },
          });
        }
        return approval;
      });
    } catch (err) {
      if (err instanceof WorkflowError && err.code !== 'NOT_FOUND') {
        await this.audit(this.repo, {
          contentId: (await this.repo.contentItems.get(contentId)) ? contentId : null,
          action: 'approval_denied',
          fromStage: null,
          toStage: null,
          actorId: actor,
          reason: `${gate} ${decision} denied: ${err.message}`,
          details: { code: err.code },
        });
      }
      throw err;
    }
  }

  private async invalidate(tx: Repository, item: ContentIdea, gates: GateId[], keep: (a: Approval) => boolean, reason: string, actor: ActorId): Promise<number> {
    let n = 0;
    for (const gate of gates) {
      for (const a of await tx.approvals.list({ contentId: item.id, gate, status: 'valid' })) {
        if (keep(a)) continue;
        await tx.approvals.update(a.id, { status: 'invalidated', invalidatedAt: this.ts(), invalidationReason: reason });
        await this.audit(tx, {
          contentId: item.id,
          action: 'invalidation',
          fromStage: item.stage,
          toStage: null,
          actorId: actor,
          reason: `${gate} invalidated: ${reason}`,
          details: { approvalId: a.id, gate },
        });
        n++;
      }
    }
    return n;
  }

  /** Backward move caused by a change (not a user transition): no gate check, always audited. */
  private async demote(tx: Repository, item: ContentIdea, to: PipelineStage, actor: ActorId, reason: string): Promise<void> {
    await tx.contentItems.update(item.id, { stage: to, scheduledAt: null, updatedAt: this.ts() });
    for (const p of await tx.publications.list({ contentId: item.id, status: 'scheduled' }))
      await tx.publications.update(p.id, { status: 'cancelled', updatedAt: this.ts() });
    await this.audit(tx, { contentId: item.id, action: 'transition', fromStage: item.stage, toStage: to, actorId: actor, reason: `automatic: ${reason}`, details: null });
  }

  // ---------------------------------------------------------------- scripts, assets, captions

  /** Stores a new immutable script revision (version n+1). Invalidates G2/G3 on older revisions. */
  async addScriptRevision(contentId: string, input: NewScriptRevision, actorId: string): Promise<ScriptRevision> {
    const actor = this.actor(actorId);
    if (!input.body?.trim() || input.hook === undefined) throw new WorkflowError('INVALID_INPUT', 'hook and body are required');
    return this.repo.transaction(async (tx) => {
      const item = await this.item(tx, contentId);
      if (item.stage === 'PUBLISHED') throw new WorkflowError('ALREADY_PUBLISHED', 'Published content cannot get a new script revision');
      const now = this.ts();
      let script = await tx.scripts.first({ contentId });
      if (!script)
        script = await tx.scripts.insert({ id: newId('sc'), contentId, title: input.title ?? item.title, currentRevisionId: null, authorId: actor, createdAt: now, updatedAt: now });
      const latest = await tx.scriptRevisions.first({ scriptId: script.id }, { orderBy: 'version', desc: true });
      const version = (latest?.version ?? 0) + 1;
      const onScreenText = input.onScreenText ?? [];
      const rev = await tx.scriptRevisions.insert({
        id: newId('sr'),
        scriptId: script.id,
        contentId,
        version,
        hook: input.hook,
        body: input.body,
        cta: input.cta ?? null,
        onScreenText,
        captionText: input.captionText ?? null,
        sha256: sha256(normalizeText(JSON.stringify([input.hook, input.body, input.cta ?? null, onScreenText, input.captionText ?? null]))),
        authorId: actor,
        changeNote: input.changeNote ?? null,
        createdAt: now,
      });
      await tx.scripts.update(script.id, { currentRevisionId: rev.id, updatedAt: now });
      await tx.contentItems.update(contentId, { currentScriptRevisionId: rev.id, updatedAt: now });
      await this.audit(tx, { contentId, action: 'script_revision', fromStage: item.stage, toStage: null, actorId: actor, reason: `script v${version}${input.changeNote ? `: ${input.changeNote}` : ''}`, details: { scriptRevisionId: rev.id, version } });
      await this.invalidate(tx, item, ['G2', 'G3'], (a) => a.scriptRevisionId === rev.id, `script changed to v${version}`, actor);
      return rev;
    });
  }

  /** Registers a new rendered video. A different hash invalidates G4/G5 and demotes post-render items to QA_REVIEW. */
  async setVideoAsset(contentId: string, input: NewVideoAsset, actorId: string): Promise<VideoAsset> {
    const actor = this.actor(actorId);
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new WorkflowError('INVALID_INPUT', 'sha256 must be 64 hex chars');
    return this.repo.transaction(async (tx) => {
      const item = await this.item(tx, contentId);
      if (item.stage === 'PUBLISHED') throw new WorkflowError('ALREADY_PUBLISHED', 'Published content cannot change its video');
      const now = this.ts();
      const asset = await tx.videoAssets.insert({
        id: newId('va'),
        contentId,
        scriptRevisionId: input.scriptRevisionId ?? item.currentScriptRevisionId,
        path: input.path,
        sha256: input.sha256,
        durationMs: input.durationMs ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        createdBy: actor,
        createdAt: now,
      });
      const changed = item.currentAssetSha256 !== input.sha256;
      await tx.contentItems.update(contentId, { currentVideoAssetId: asset.id, currentAssetSha256: input.sha256, updatedAt: now });
      await this.audit(tx, { contentId, action: 'asset_change', fromStage: item.stage, toStage: null, actorId: actor, reason: changed ? 'new video asset' : 'same video hash re-registered', details: { videoAssetId: asset.id, sha256: input.sha256 } });
      if (changed) {
        const n = await this.invalidate(tx, item, ['G4', 'G5'], (a) => a.assetSha256 === input.sha256, 'video asset changed', actor);
        if (POST_RENDER_STAGES.includes(item.stage) && item.stage !== 'RENDERED' && item.stage !== 'QA_REVIEW')
          await this.demote(tx, item, 'QA_REVIEW', actor, `video asset changed (${n} approvals invalidated)`);
      }
      return asset;
    });
  }

  /** Sets the caption. A different hash invalidates G5 and demotes approved/scheduled items to READY_FOR_EDITOR. */
  async setCaption(contentId: string, captionText: string, actorId: string): Promise<ContentIdea> {
    const actor = this.actor(actorId);
    const hash = hashCaption(captionText);
    return this.repo.transaction(async (tx) => {
      const item = await this.item(tx, contentId);
      if (item.stage === 'PUBLISHED') throw new WorkflowError('ALREADY_PUBLISHED', 'Published content cannot change its caption');
      if (item.captionHash === hash) return item;
      const updated = await tx.contentItems.update(contentId, { captionText, captionHash: hash, updatedAt: this.ts() });
      await this.audit(tx, { contentId, action: 'caption_change', fromStage: item.stage, toStage: null, actorId: actor, reason: 'caption changed', details: { captionHash: hash } });
      await this.invalidate(tx, item, ['G5'], (a) => a.captionHash === hash && a.assetSha256 === item.currentAssetSha256, 'caption changed', actor);
      if (item.stage === 'APPROVED_FOR_PUBLISHING' || item.stage === 'SCHEDULED') {
        await this.demote(tx, item, 'READY_FOR_EDITOR', actor, 'caption changed after G5');
        return (await tx.contentItems.get(contentId))!;
      }
      return updated;
    });
  }

  // ---------------------------------------------------------------- publishing

  /**
   * Moves APPROVED_FOR_PUBLISHING -> SCHEDULED and records the publication. The caller must pass
   * the hash recomputed from the file it is about to send (or `filePath`), plus the caption hash.
   */
  async schedulePublication(contentId: string, input: SchedulePublicationInput, actorId: string): Promise<Publication> {
    const actor = this.actor(actorId);
    const assetSha = input.assetSha256 ?? (input.filePath ? await sha256File(input.filePath) : undefined);
    const capHash = input.captionHash ?? (input.captionText !== undefined ? hashCaption(input.captionText) : undefined);
    if (!assetSha || !capHash) throw new WorkflowError('INVALID_INPUT', 'assetSha256 (or filePath) and captionHash (or captionText) are required');
    if (Number.isNaN(Date.parse(input.scheduledAt))) throw new WorkflowError('INVALID_INPUT', 'scheduledAt must be an ISO date');
    try {
      return await this.repo.transaction(async (tx) => {
        const item = await this.item(tx, contentId);
        if (assetSha !== item.currentAssetSha256) throw new WorkflowError('BINDING_MISMATCH', 'File hash differs from the current approved video asset');
        if (capHash !== item.captionHash) throw new WorkflowError('BINDING_MISMATCH', 'Caption differs from the approved caption');
        const g5 = await this.gateStateIn(tx, item, 'G5');
        await this.transitionIn(tx, contentId, 'SCHEDULED', actor, `scheduled on ${input.platform} for ${input.scheduledAt}`, { scheduledAt: input.scheduledAt });
        const now = this.ts();
        const pub = await tx.publications.insert({
          id: newId('pub'),
          contentId,
          platform: input.platform,
          status: 'scheduled',
          scheduledAt: input.scheduledAt,
          publishedAt: null,
          externalId: null,
          url: null,
          videoAssetSha256: assetSha,
          captionHash: capHash,
          approvalId: g5.approvalIds[0]!,
          createdBy: actor,
          createdAt: now,
          updatedAt: now,
        });
        await this.audit(tx, { contentId, action: 'publication', fromStage: 'SCHEDULED', toStage: null, actorId: actor, reason: `publication ${pub.id} scheduled`, details: { publicationId: pub.id, platform: input.platform } });
        return pub;
      });
    } catch (err) {
      if (err instanceof WorkflowError && err.code === 'BINDING_MISMATCH') {
        await this.audit(this.repo, { contentId, action: 'transition_denied', fromStage: null, toStage: 'SCHEDULED', actorId: actor, reason: `schedule denied: ${err.message}`, details: { code: err.code } });
      }
      throw err;
    }
  }

  /** Records that a scheduled publication went live (SCHEDULED -> PUBLISHED, G5 re-checked). */
  async markPublished(contentId: string, input: { publicationId: string; externalId?: string | null; url?: string | null; publishedAt?: string }, actorId: string): Promise<Publication> {
    const actor = this.actor(actorId);
    return this.repo.transaction(async (tx) => {
      const pub = await tx.publications.get(input.publicationId);
      if (!pub || pub.contentId !== contentId) throw new WorkflowError('NOT_FOUND', 'publication not found for this content');
      const item = await this.item(tx, contentId);
      if (pub.videoAssetSha256 !== item.currentAssetSha256 || pub.captionHash !== item.captionHash)
        throw new WorkflowError('BINDING_MISMATCH', 'Publication no longer matches the current asset/caption');
      await this.transitionIn(tx, contentId, 'PUBLISHED', actor, `published on ${pub.platform}`);
      return tx.publications.update(pub.id, {
        status: 'published',
        publishedAt: input.publishedAt ?? this.ts(),
        externalId: input.externalId ?? null,
        url: input.url ?? null,
        updatedAt: this.ts(),
      });
    });
  }

  async getAuditLog(contentId: string): Promise<AuditLog[]> {
    return this.repo.auditLog.list({ contentId }, { orderBy: 'id' });
  }
}

/** RJ_EMERGENCY_STOP=1 in env, or system_configuration.emergency_stop === true. */
export async function isEmergencyStopActive(repo: Repository, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const flag = (env.RJ_EMERGENCY_STOP ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(flag)) return true;
  return (await repo.getConfig<boolean>('emergency_stop')) === true;
}

function bindingLabel(b: string): string {
  return b === 'scriptRevision' ? 'script revision' : b === 'asset' ? 'video asset hash' : b === 'assetAndCaption' ? 'video asset hash + caption hash' : 'state';
}
