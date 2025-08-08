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
exports.checkSignatures = void 0;
const path = __importStar(require("path"));
const spawn_1 = require("./spawn");
const debug_1 = __importDefault(require("debug"));
const d = (0, debug_1.default)('electron-notarize');
const codesignDisplay = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, spawn_1.spawn)('codesign', ['-dv', '-vvvv', '--deep', path.basename(opts.appPath)], {
        cwd: path.dirname(opts.appPath),
    });
    return result;
});
const codesign = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    d('attempting to check codesign of app:', opts.appPath);
    const result = yield (0, spawn_1.spawn)('codesign', ['-vvv', '--deep', '--strict', path.basename(opts.appPath)], {
        cwd: path.dirname(opts.appPath),
    });
    return result;
});
function checkSignatures(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const [codesignResult, codesignInfo] = yield Promise.all([codesign(opts), codesignDisplay(opts)]);
        let error = '';
        if (codesignInfo.code !== 0) {
            d('codesignInfo failed');
            error = `Failed to display codesign info on your application with code: ${codesignInfo.code}\n\n${codesignInfo.output}\n`;
        }
        if (codesignResult.code !== 0) {
            d('codesign check failed');
            error += `Failed to codesign your application with code: ${codesignResult.code}\n\n${codesignResult.output}\n\n${codesignInfo.output}`;
        }
        if (error) {
            throw new Error(error);
        }
        d('codesign assess succeeded');
    });
}
exports.checkSignatures = checkSignatures;
//# sourceMappingURL=check-signature.js.map