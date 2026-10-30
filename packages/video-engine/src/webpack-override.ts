import type { WebpackOverrideFn } from '@remotion/bundler';

/** Workspace packages import './x.js' that resolve to './x.ts' (NodeNext style). */
export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
});
