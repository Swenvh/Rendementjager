import type { Worker } from '../runner.js';
import { NonRetryableError } from '../runner.js';
import { createPublishDueHandler, type PublishDeps } from '../publishing.js';
import { createRenderBatchHandler, type RenderBatchOptions } from './render-batch.js';
import { createDailyBriefHandler, type DailyBriefHandlerOptions } from './daily-brief.js';
import { createWorkspaceScriptHandler, type ShellHandlerOptions } from './shell.js';

export * from './daily-brief.js';
export * from './shell.js';
export * from './render-batch.js';

export interface DefaultHandlerOptions {
  dailyBrief?: DailyBriefHandlerOptions;
  shell?: ShellHandlerOptions;
  renderBatch?: RenderBatchOptions;
  /** Test seams for publish_due (root, adapter, hostedHash). */
  publish?: Partial<PublishDeps>;
}

/**
 * Registers the default handlers:
 * - daily_brief   -> real briefing from DB state, written to output/reports/<date>-daily-brief.md
 * - render_video  -> npm run render -w @rj/video-engine -- --content <payload.slug ?? contentId>
 * - render_batch  -> fans out renders (RJ_RENDER_CONCURRENCY, idempotent by input hash, time/cost caps, emergency stop)
 * - render_cover  -> npm run cover  -w @rj/video-engine -- --content <...>
 * - media_qa      -> npm run qa     -w @rj/video-engine -- --content <...>
 * - generate_audio-> npm run voice  -w @rj/video-engine -- --content <...> (voice-over via prepareContent: storyboard
 *                    + finance-engine -> @rj/voice-engine synthesizeScript, cached, audio QA; local fallback unless RJ_TTS_PROVIDER=elevenlabs)
 * - publish_due  -> verifies G5 + hashes, guards (duplicate, caps, spacing, stop), then stages for manual posting or
 *                    (live Instagram, untested) posts; see publishing.ts
 * - collect_metrics -> fails "not available" (no metrics provider; never fabricate metrics)
 */
export function registerDefaultHandlers(worker: Worker, options: DefaultHandlerOptions = {}): Worker {
  return worker
    .register('daily_brief', createDailyBriefHandler(options.dailyBrief))
    .register('render_video', createWorkspaceScriptHandler({ workspace: '@rj/video-engine', script: 'render' }, options.shell))
    .register('render_batch', createRenderBatchHandler(options.renderBatch))
    .register('publish_due', createPublishDueHandler(options.publish))
    .register('render_cover', createWorkspaceScriptHandler({ workspace: '@rj/video-engine', script: 'cover' }, options.shell))
    .register('media_qa', createWorkspaceScriptHandler({ workspace: '@rj/video-engine', script: 'qa' }, options.shell))
    .register('generate_audio', createWorkspaceScriptHandler({ workspace: '@rj/video-engine', script: 'voice' }, options.shell))
    .register('collect_metrics', async () => {
      throw new NonRetryableError('not available: no analytics provider connected; enter metrics manually (unknown stays null)');
    });
}
