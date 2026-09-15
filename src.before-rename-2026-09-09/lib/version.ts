import pkg from '../../package.json';

/** Single source of truth for the app version (package.json). */
export const APP_VERSION: string = pkg.version;
export const APP_VERSION_SHORT = `v${APP_VERSION.split('.').slice(0, 2).join('.')}`;
