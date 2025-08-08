"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.spawn = void 0;
const child_process_1 = require("child_process");
const debug_1 = __importDefault(require("debug"));
const helpers_1 = require("./helpers");
const d = (0, debug_1.default)('electron-notarize:spawn');
const spawn = (cmd, args = [], opts = {}) => {
    d('spawning cmd:', cmd, 'args:', args.map(arg => ((0, helpers_1.isSecret)(arg) ? '*********' : arg)), 'opts:', opts);
    const child = (0, child_process_1.spawn)(cmd, args, opts);
    const out = [];
    const dataHandler = (data) => out.push(data.toString());
    child.stdout.on('data', dataHandler);
    child.stderr.on('data', dataHandler);
    return new Promise((resolve, reject) => {
        child.on('error', err => {
            reject(err);
        });
        child.on('exit', code => {
            d(`cmd ${cmd} terminated with code: ${code}`);
            resolve({
                code,
                output: out.join(''),
            });
        });
    });
};
exports.spawn = spawn;
//# sourceMappingURL=spawn.js.map