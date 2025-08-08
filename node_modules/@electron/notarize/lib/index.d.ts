import { NotarizeOptions } from './types';
export { NotarizeOptions };
export { validateLegacyAuthorizationArgs as validateAuthorizationArgs } from './validate-args';
export declare function notarize({ appPath, ...otherOptions }: NotarizeOptions): Promise<void>;
