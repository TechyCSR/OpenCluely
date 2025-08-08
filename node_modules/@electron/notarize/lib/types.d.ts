export interface LegacyNotarizePasswordCredentials {
    appleId: string;
    appleIdPassword: string;
}
export interface NotaryToolPasswordCredentials {
    appleId: string;
    appleIdPassword: string;
    teamId: string;
}
export interface LegacyNotarizeApiKeyCredentials {
    appleApiKey: string;
    appleApiIssuer: string;
}
export interface NotaryToolApiKeyCredentials {
    appleApiKey: string;
    appleApiKeyId: string;
    appleApiIssuer: string;
}
export interface NotaryToolKeychainCredentials {
    keychainProfile: string;
    keychain?: string;
}
export type LegacyNotarizeCredentials = LegacyNotarizePasswordCredentials | LegacyNotarizeApiKeyCredentials;
export type NotaryToolCredentials = NotaryToolPasswordCredentials | NotaryToolApiKeyCredentials | NotaryToolKeychainCredentials;
export type NotarizeCredentials = LegacyNotarizeCredentials | NotaryToolCredentials;
export interface LegacyNotarizeAppOptions {
    appPath: string;
    appBundleId: string;
}
export interface NotaryToolNotarizeAppOptions {
    appPath: string;
}
export interface TransporterOptions {
    ascProvider?: string;
}
export interface NotarizeResult {
    uuid: string;
}
export type LegacyNotarizeStartOptions = LegacyNotarizeAppOptions & LegacyNotarizeCredentials & TransporterOptions;
export type NotaryToolStartOptions = NotaryToolNotarizeAppOptions & NotaryToolCredentials;
export type LegacyNotarizeWaitOptions = NotarizeResult & LegacyNotarizeCredentials;
export type NotarizeStapleOptions = Pick<LegacyNotarizeAppOptions, 'appPath'>;
export type NotarizeOptions = ({
    tool?: 'legacy';
} & LegacyNotarizeStartOptions) | ({
    tool: 'notarytool';
} & NotaryToolStartOptions);
