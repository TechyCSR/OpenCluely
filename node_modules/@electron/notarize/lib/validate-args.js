"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNotaryToolAuthorizationArgs = exports.isNotaryToolKeychainCredentials = exports.isNotaryToolApiKeyCredentials = exports.isNotaryToolPasswordCredentials = exports.validateLegacyAuthorizationArgs = exports.isLegacyApiKeyCredentials = exports.isLegacyPasswordCredentials = void 0;
function isLegacyPasswordCredentials(opts) {
    const creds = opts;
    return creds.appleId !== undefined || creds.appleIdPassword !== undefined;
}
exports.isLegacyPasswordCredentials = isLegacyPasswordCredentials;
function isLegacyApiKeyCredentials(opts) {
    const creds = opts;
    return creds.appleApiKey !== undefined || creds.appleApiIssuer !== undefined;
}
exports.isLegacyApiKeyCredentials = isLegacyApiKeyCredentials;
function validateLegacyAuthorizationArgs(opts) {
    const isPassword = isLegacyPasswordCredentials(opts);
    const isApiKey = isLegacyApiKeyCredentials(opts);
    if (isPassword && isApiKey) {
        throw new Error('Cannot use both password credentials and API key credentials at once');
    }
    if (isPassword) {
        const passwordCreds = opts;
        if (!passwordCreds.appleId) {
            throw new Error('The appleId property is required when using notarization with appleIdPassword');
        }
        else if (!passwordCreds.appleIdPassword) {
            throw new Error('The appleIdPassword property is required when using notarization with appleId');
        }
        return passwordCreds;
    }
    if (isApiKey) {
        const apiKeyCreds = opts;
        if (!apiKeyCreds.appleApiKey) {
            throw new Error('The appleApiKey property is required when using notarization with appleApiIssuer');
        }
        else if (!apiKeyCreds.appleApiIssuer) {
            throw new Error('The appleApiIssuer property is required when using notarization with appleApiKey');
        }
        return apiKeyCreds;
    }
    throw new Error('No authentication properties provided (e.g. appleId, appleApiKey)');
}
exports.validateLegacyAuthorizationArgs = validateLegacyAuthorizationArgs;
function isNotaryToolPasswordCredentials(opts) {
    const creds = opts;
    return (creds.appleId !== undefined || creds.appleIdPassword !== undefined || creds.teamId !== undefined);
}
exports.isNotaryToolPasswordCredentials = isNotaryToolPasswordCredentials;
function isNotaryToolApiKeyCredentials(opts) {
    const creds = opts;
    return (creds.appleApiIssuer !== undefined ||
        creds.appleApiKey !== undefined ||
        creds.appleApiKeyId !== undefined);
}
exports.isNotaryToolApiKeyCredentials = isNotaryToolApiKeyCredentials;
function isNotaryToolKeychainCredentials(opts) {
    const creds = opts;
    return creds.keychain !== undefined || creds.keychainProfile !== undefined;
}
exports.isNotaryToolKeychainCredentials = isNotaryToolKeychainCredentials;
function validateNotaryToolAuthorizationArgs(opts) {
    const isPassword = isNotaryToolPasswordCredentials(opts);
    const isApiKey = isNotaryToolApiKeyCredentials(opts);
    const isKeychain = isNotaryToolKeychainCredentials(opts);
    if ((isPassword ? 1 : 0) + (isApiKey ? 1 : 0) + (isKeychain ? 1 : 0) > 1) {
        throw new Error('Cannot use password credentials, API key credentials and keychain credentials at once');
    }
    if (isPassword) {
        const passwordCreds = opts;
        if (!passwordCreds.appleId) {
            throw new Error('The appleId property is required when using notarization with password credentials');
        }
        else if (!passwordCreds.appleIdPassword) {
            throw new Error('The appleIdPassword property is required when using notarization with password credentials');
        }
        else if (!passwordCreds.teamId) {
            throw new Error('The teamId property is required when using notarization with password credentials');
        }
        return passwordCreds;
    }
    if (isApiKey) {
        const apiKeyCreds = opts;
        if (!apiKeyCreds.appleApiKey) {
            throw new Error('The appleApiKey property is required when using notarization with ASC credentials');
        }
        else if (!apiKeyCreds.appleApiIssuer) {
            throw new Error('The appleApiIssuer property is required when using notarization with ASC credentials');
        }
        else if (!apiKeyCreds.appleApiKeyId) {
            throw new Error('The appleApiKeyId property is required when using notarization with ASC credentials');
        }
        return apiKeyCreds;
    }
    if (isKeychain) {
        const keychainCreds = opts;
        if (!keychainCreds.keychainProfile) {
            throw new Error('The keychainProfile property is required when using notarization with keychain credentials');
        }
        return keychainCreds;
    }
    throw new Error('No authentication properties provided (e.g. appleId, appleApiKey, keychain)');
}
exports.validateNotaryToolAuthorizationArgs = validateNotaryToolAuthorizationArgs;
//# sourceMappingURL=validate-args.js.map