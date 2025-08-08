"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForLegacyNotarize = exports.startLegacyNotarize = void 0;
const debug_1 = __importDefault(require("debug"));
const path = __importStar(require("path"));
const spawn_1 = require("./spawn");
const helpers_1 = require("./helpers");
const validate_args_1 = require("./validate-args");
const d = (0, debug_1.default)('electron-notarize:legacy');
function authorizationArgs(rawOpts) {
    const opts = (0, validate_args_1.validateLegacyAuthorizationArgs)(rawOpts);
    if ((0, validate_args_1.isLegacyPasswordCredentials)(opts)) {
        return ['-u', (0, helpers_1.makeSecret)(opts.appleId), '-p', (0, helpers_1.makeSecret)(opts.appleIdPassword)];
    }
    else {
        return [
            '--apiKey',
            (0, helpers_1.makeSecret)(opts.appleApiKey),
            '--apiIssuer',
            (0, helpers_1.makeSecret)(opts.appleApiIssuer),
        ];
    }
}
function startLegacyNotarize(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        d('starting notarize process for app:', opts.appPath);
        return yield (0, helpers_1.withTempDir)((dir) => __awaiter(this, void 0, void 0, function* () {
            const zipPath = path.resolve(dir, `${path.basename(opts.appPath, '.app')}.zip`);
            d('zipping application to:', zipPath);
            const zipResult = yield (0, spawn_1.spawn)('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path.basename(opts.appPath), zipPath], {
                cwd: path.dirname(opts.appPath),
            });
            if (zipResult.code !== 0) {
                throw new Error(`Failed to zip application, exited with code: ${zipResult.code}\n\n${zipResult.output}`);
            }
            d('zip succeeded, attempting to upload to Apple');
            const notarizeArgs = [
                'altool',
                '--notarize-app',
                '-f',
                zipPath,
                '--primary-bundle-id',
                opts.appBundleId,
                ...authorizationArgs(opts),
            ];
            if (opts.ascProvider) {
                notarizeArgs.push('-itc_provider', opts.ascProvider);
            }
            const result = yield (0, spawn_1.spawn)('xcrun', notarizeArgs);
            if (result.code !== 0) {
                throw new Error(`Failed to upload app to Apple's notarization servers\n\n${result.output}`);
            }
            d('upload success');
            const uuidMatch = /\nRequestUUID = (.+?)\n/g.exec(result.output);
            if (!uuidMatch) {
                throw new Error(`Failed to find request UUID in output:\n\n${result.output}`);
            }
            d('found UUID:', uuidMatch[1]);
            return {
                uuid: uuidMatch[1],
            };
        }));
    });
}
exports.startLegacyNotarize = startLegacyNotarize;
function waitForLegacyNotarize(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        d('checking notarization status:', opts.uuid);
        const result = yield (0, spawn_1.spawn)('xcrun', [
            'altool',
            '--notarization-info',
            opts.uuid,
            ...authorizationArgs(opts),
        ]);
        if (result.code !== 0) {
            // These checks could fail for all sorts of reasons, including:
            //  * The status of a request isn't available as soon as the upload request returns, so
            //    it may just not be ready yet.
            //  * If using keychain password, user's mac went to sleep and keychain locked.
            //  * Regular old connectivity failure.
            d(`Failed to check status of notarization request, retrying in 30 seconds: ${opts.uuid}\n\n${result.output}`);
            yield (0, helpers_1.delay)(30000);
            return waitForLegacyNotarize(opts);
        }
        const notarizationInfo = (0, helpers_1.parseNotarizationInfo)(result.output);
        if (notarizationInfo.status === 'in progress') {
            d('still in progress, waiting 30 seconds');
            yield (0, helpers_1.delay)(30000);
            return waitForLegacyNotarize(opts);
        }
        d('notarzation done with info:', notarizationInfo);
        if (notarizationInfo.status === 'invalid') {
            d('notarization failed');
            throw new Error(`Apple failed to notarize your application, check the logs for more info

Status Code: ${notarizationInfo.statusCode || 'No Code'}
Message: ${notarizationInfo.statusMessage || 'No Message'}
Logs: ${notarizationInfo.logFileUrl}`);
        }
        if (notarizationInfo.status !== 'success') {
            throw new Error(`Unrecognized notarization status: "${notarizationInfo.status}"`);
        }
        d('notarization was successful');
        return;
    });
}
exports.waitForLegacyNotarize = waitForLegacyNotarize;
//# sourceMappingURL=legacy.js.map