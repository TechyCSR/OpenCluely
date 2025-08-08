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
exports.delay = exports.parseNotarizationInfo = exports.isSecret = exports.makeSecret = exports.withTempDir = void 0;
const debug_1 = __importDefault(require("debug"));
const fs = __importStar(require("fs-extra"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const d = (0, debug_1.default)('electron-notarize:helpers');
function withTempDir(fn) {
    return __awaiter(this, void 0, void 0, function* () {
        const dir = yield fs.mkdtemp(path.resolve(os.tmpdir(), 'electron-notarize-'));
        d('doing work inside temp dir:', dir);
        let result;
        try {
            result = yield fn(dir);
        }
        catch (err) {
            d('work failed');
            yield fs.remove(dir);
            throw err;
        }
        d('work succeeded');
        yield fs.remove(dir);
        return result;
    });
}
exports.withTempDir = withTempDir;
class Secret {
    constructor(value) {
        this.value = value;
    }
    toString() {
        return this.value;
    }
    inspect() {
        return '******';
    }
}
function makeSecret(s) {
    return new Secret(s);
}
exports.makeSecret = makeSecret;
function isSecret(s) {
    return s instanceof Secret;
}
exports.isSecret = isSecret;
function parseNotarizationInfo(info) {
    const out = {};
    const matchToProperty = (key, r, modifier) => {
        const exec = r.exec(info);
        if (exec) {
            out[key] = modifier ? modifier(exec[1]) : exec[1];
        }
    };
    matchToProperty('uuid', /\n *RequestUUID: (.+?)\n/);
    matchToProperty('date', /\n *Date: (.+?)\n/, d => new Date(d));
    matchToProperty('status', /\n *Status: (.+?)\n/);
    matchToProperty('logFileUrl', /\n *LogFileURL: (.+?)\n/);
    matchToProperty('statusCode', /\n *Status Code: (.+?)\n/, n => parseInt(n, 10));
    matchToProperty('statusMessage', /\n *Status Message: (.+?)\n/);
    if (out.logFileUrl === '(null)') {
        out.logFileUrl = null;
    }
    return out;
}
exports.parseNotarizationInfo = parseNotarizationInfo;
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.delay = delay;
//# sourceMappingURL=helpers.js.map