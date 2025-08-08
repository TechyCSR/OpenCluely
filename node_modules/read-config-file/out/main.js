"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = exports.loadParentConfig = exports.getConfig = exports.loadConfig = exports.orIfFileNotExist = exports.orNullIfFileNotExist = exports.findAndReadConfig = void 0;
const fs_1 = require("fs");
const js_yaml_1 = require("js-yaml");
const path = require("path");
const dotenv_1 = require("dotenv");
const config_file_ts_1 = require("config-file-ts");
async function readConfig(configFile, request) {
    const data = await fs_1.promises.readFile(configFile, "utf8");
    let result;
    if (configFile.endsWith(".json5") || configFile.endsWith(".json")) {
        result = require("json5").parse(data);
    }
    else if (configFile.endsWith(".js") || configFile.endsWith(".cjs")) {
        result = require(configFile);
        if (result.default != null) {
            result = result.default;
        }
        if (typeof result === "function") {
            result = result(request);
        }
        result = await Promise.resolve(result);
    }
    else if (configFile.endsWith(".ts")) {
        result = config_file_ts_1.loadTsConfig(configFile);
        if (typeof result === "function") {
            result = result(request);
        }
        result = await Promise.resolve(result);
    }
    else if (configFile.endsWith(".toml")) {
        result = require("toml").parse(data);
    }
    else {
        result = js_yaml_1.load(data);
    }
    return { result, configFile };
}
async function findAndReadConfig(request) {
    const prefix = request.configFilename;
    for (const configFile of [`${prefix}.yml`, `${prefix}.yaml`, `${prefix}.json`, `${prefix}.json5`, `${prefix}.toml`, `${prefix}.js`, `${prefix}.cjs`, `${prefix}.ts`]) {
        const data = await orNullIfFileNotExist(readConfig(path.join(request.projectDir, configFile), request));
        if (data != null) {
            return data;
        }
    }
    return null;
}
exports.findAndReadConfig = findAndReadConfig;
function orNullIfFileNotExist(promise) {
    return orIfFileNotExist(promise, null);
}
exports.orNullIfFileNotExist = orNullIfFileNotExist;
function orIfFileNotExist(promise, fallbackValue) {
    return promise
        .catch(e => {
        if (e.code === "ENOENT" || e.code === "ENOTDIR") {
            return fallbackValue;
        }
        throw e;
    });
}
exports.orIfFileNotExist = orIfFileNotExist;
async function loadConfig(request) {
    let packageMetadata = request.packageMetadata == null ? null : await request.packageMetadata.value;
    if (packageMetadata == null) {
        const json = await orNullIfFileNotExist(fs_1.promises.readFile(path.join(request.projectDir, "package.json"), "utf8"));
        packageMetadata = json == null ? null : JSON.parse(json);
    }
    const data = packageMetadata == null ? null : packageMetadata[request.packageKey];
    return data == null ? findAndReadConfig(request) : { result: data, configFile: null };
}
exports.loadConfig = loadConfig;
function getConfig(request, configPath) {
    if (configPath == null) {
        return loadConfig(request);
    }
    else {
        return readConfig(path.resolve(request.projectDir, configPath), request);
    }
}
exports.getConfig = getConfig;
async function loadParentConfig(request, spec) {
    let isFileSpec;
    if (spec.startsWith("file:")) {
        spec = spec.substring("file:".length);
        isFileSpec = true;
    }
    let parentConfig = await orNullIfFileNotExist(readConfig(path.resolve(request.projectDir, spec), request));
    if (parentConfig == null && isFileSpec !== true) {
        let resolved = null;
        try {
            resolved = require.resolve(spec);
        }
        catch (e) {
            // ignore
        }
        if (resolved != null) {
            parentConfig = await readConfig(resolved, request);
        }
    }
    if (parentConfig == null) {
        throw new Error(`Cannot find parent config file: ${spec}`);
    }
    return parentConfig;
}
exports.loadParentConfig = loadParentConfig;
async function loadEnv(envFile) {
    const data = await orNullIfFileNotExist(fs_1.promises.readFile(envFile, "utf8"));
    if (data == null) {
        return null;
    }
    const parsed = dotenv_1.parse(data);
    for (const key of Object.keys(parsed)) {
        if (!process.env.hasOwnProperty(key)) {
            process.env[key] = parsed[key];
        }
    }
    require("dotenv-expand")(parsed);
    return parsed;
}
exports.loadEnv = loadEnv;
//# sourceMappingURL=main.js.map