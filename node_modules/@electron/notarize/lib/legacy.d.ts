import { NotarizeResult, LegacyNotarizeStartOptions, LegacyNotarizeWaitOptions } from './types';
export declare function startLegacyNotarize(opts: LegacyNotarizeStartOptions): Promise<NotarizeResult>;
export declare function waitForLegacyNotarize(opts: LegacyNotarizeWaitOptions): Promise<void>;
