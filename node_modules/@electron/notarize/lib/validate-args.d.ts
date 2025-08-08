import { LegacyNotarizeApiKeyCredentials, LegacyNotarizeCredentials, LegacyNotarizePasswordCredentials, NotaryToolApiKeyCredentials, NotaryToolCredentials, NotaryToolKeychainCredentials, NotaryToolPasswordCredentials } from './types';
export declare function isLegacyPasswordCredentials(opts: LegacyNotarizeCredentials): opts is LegacyNotarizePasswordCredentials;
export declare function isLegacyApiKeyCredentials(opts: LegacyNotarizeCredentials): opts is LegacyNotarizeApiKeyCredentials;
export declare function validateLegacyAuthorizationArgs(opts: LegacyNotarizeCredentials): LegacyNotarizeCredentials;
export declare function isNotaryToolPasswordCredentials(opts: NotaryToolCredentials): opts is NotaryToolPasswordCredentials;
export declare function isNotaryToolApiKeyCredentials(opts: NotaryToolCredentials): opts is NotaryToolApiKeyCredentials;
export declare function isNotaryToolKeychainCredentials(opts: NotaryToolCredentials): opts is NotaryToolKeychainCredentials;
export declare function validateNotaryToolAuthorizationArgs(opts: NotaryToolCredentials): NotaryToolCredentials;
