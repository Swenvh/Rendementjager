/**
 * Logo configuration. There is NO official logo yet: the placeholder is used
 * until `assets/brand/logo-official.svg` exists.
 *
 * To switch to the official asset, drop the file at assets/brand/logo-official.svg.
 * `resolveLogo()` prefers it automatically; `logo` below is the static default
 * used where the filesystem cannot be checked (e.g. inside the browser bundle).
 */
export interface LogoConfig {
  /** File name inside assets/brand/ (and copied to video-engine public/brand/). */
  file: string;
  isPlaceholder: boolean;
  /** Width / height of the artwork. */
  aspectRatio: number;
  alt: string;
}

export const officialLogo: LogoConfig = {
  file: 'logo-official.svg',
  isPlaceholder: false,
  aspectRatio: 1,
  alt: 'Rendementjager',
};

export const placeholderLogo: LogoConfig = {
  file: 'logo-placeholder.svg',
  isPlaceholder: true,
  aspectRatio: 1,
  alt: 'Rendementjager (PLACEHOLDER logo)',
};

/** One-line switch: set to officialLogo once the official file is delivered. */
export const logo: LogoConfig = placeholderLogo;

/** Pick the official logo when its file exists, else the placeholder. */
export function resolveLogo(exists: (file: string) => boolean): LogoConfig {
  return exists(officialLogo.file) ? officialLogo : logo;
}
