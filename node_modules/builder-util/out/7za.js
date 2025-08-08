"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPath7x = exports.getPath7za = void 0;
const _7zip_bin_1 = require("7zip-bin");
const fs_extra_1 = require("fs-extra");
async function getPath7za() {
    await (0, fs_extra_1.chmod)(_7zip_bin_1.path7za, 0o755);
    return _7zip_bin_1.path7za;
}
exports.getPath7za = getPath7za;
async function getPath7x() {
    await (0, fs_extra_1.chmod)(_7zip_bin_1.path7x, 0o755);
    return _7zip_bin_1.path7x;
}
exports.getPath7x = getPath7x;
//# sourceMappingURL=7za.js.map