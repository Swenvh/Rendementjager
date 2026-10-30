import React from 'react';
import { Composition, Folder, Still, type CalculateMetadataFunction } from 'remotion';
import { reel } from '@rj/brand';
import { defaultTemplateA, defaultTemplateB, defaultTemplateC, defaultTemplateD } from './defaults';
import './fonts';
import { templateASchema, templateBSchema, templateCSchema, templateDSchema } from './schemas';
import { TemplateD } from './templates/TemplateD';
import { TemplateA, TemplateB } from './templates/TemplateAB';
import { TemplateC } from './templates/TemplateC';
import { CoverC } from './templates/Cover';

// Duration follows the props timeline (which follows the measured voice-over).
const fromTimeline: CalculateMetadataFunction<{ timeline: { totalMs: number } }> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.ceil((props.timeline.totalMs / 1000) * reel.fps)),
});

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Templates">
      <Composition id="TemplateA" component={TemplateA} schema={templateASchema} defaultProps={defaultTemplateA}
        calculateMetadata={fromTimeline as never} durationInFrames={900} fps={reel.fps} width={reel.width} height={reel.height} />
      <Composition id="TemplateB" component={TemplateB} schema={templateBSchema} defaultProps={defaultTemplateB}
        calculateMetadata={fromTimeline as never} durationInFrames={900} fps={reel.fps} width={reel.width} height={reel.height} />
      <Composition id="TemplateC" component={TemplateC} schema={templateCSchema} defaultProps={defaultTemplateC}
        calculateMetadata={fromTimeline as never} durationInFrames={900} fps={reel.fps} width={reel.width} height={reel.height} />
      <Composition id="TemplateD" component={TemplateD} schema={templateDSchema} defaultProps={defaultTemplateD}
        calculateMetadata={fromTimeline as never} durationInFrames={450} fps={reel.fps} width={reel.width} height={reel.height} />
    </Folder>
    <Folder name="Covers">
      <Still id="CoverC" component={CoverC} schema={templateCSchema} defaultProps={defaultTemplateC} width={reel.width} height={reel.height} />
    </Folder>
  </>
);
