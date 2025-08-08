export declare function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T>;
export declare function makeSecret(s: string): string;
export declare function isSecret(s: string): boolean;
export interface NotarizationInfo {
    uuid: string;
    date: Date;
    status: 'invalid' | 'in progress' | 'success';
    logFileUrl: string | null;
    statusCode?: 0 | 2;
    statusMessage?: string;
}
export declare function parseNotarizationInfo(info: string): NotarizationInfo;
export declare function delay(ms: number): Promise<void>;
