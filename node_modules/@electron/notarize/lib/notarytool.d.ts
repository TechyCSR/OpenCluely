import { NotaryToolStartOptions } from './types';
export declare function isNotaryToolAvailable(): Promise<boolean>;
export declare function notarizeAndWaitForNotaryTool(opts: NotaryToolStartOptions): Promise<void>;
