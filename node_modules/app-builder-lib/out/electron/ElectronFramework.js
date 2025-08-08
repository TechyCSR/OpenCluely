"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createElectronFrameworkSupport = exports.createBrandingOpts = void 0;
const bluebird_lst_1 = require("bluebird-lst");
const builder_util_1 = require("builder-util");
const fs_1 = require("builder-util/out/fs");
const fs_extra_1 = require("fs-extra");
const path = require("path");
const index_1 = require("../index");
const pathManager_1 = require("../util/pathManager");
const electronMac_1 = require("./electronMac");
const electronVersion_1 = require("./electronVersion");
const fs = require("fs/promises");
const injectFFMPEG_1 = require("./injectFFMPEG");
function createBrandingOpts(opts) {
    var _a, _b;
    return {
        projectName: ((_a = opts.electronBranding) === null || _a === void 0 ? void 0 : _a.projectName) || "electron",
        productName: ((_b = opts.electronBranding) === null || _b === void 0 ? void 0 : _b.productName) || "Electron",
    };
}
exports.createBrandingOpts = createBrandingOpts;
function createDownloadOpts(opts, platform, arch, electronVersion) {
    return {
        platform,
        arch,
        version: electronVersion,
        ...opts.electronDownload,
    };
}
async function beforeCopyExtraFiles(options) {
    const { appOutDir, packager } = options;
    const electronBranding = createBrandingOpts(packager.config);
    if (packager.platform === index_1.Platform.LINUX) {
        const linuxPackager = packager;
        const executable = path.join(appOutDir, linuxPackager.executableName);
        await (0, fs_extra_1.rename)(path.join(appOutDir, electronBranding.projectName), executable);
    }
    else if (packager.platform === index_1.Platform.WINDOWS) {
        const executable = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`);
        await (0, fs_extra_1.rename)(path.join(appOutDir, `${electronBranding.projectName}.exe`), executable);
    }
    else {
        await (0, electronMac_1.createMacApp)(packager, appOutDir, options.asarIntegrity, options.platformName === "mas");
    }
    await removeUnusedLanguagesIfNeeded(options);
}
async function removeUnusedLanguagesIfNeeded(options) {
    const { packager: { config, platformSpecificBuildOptions }, } = options;
    const wantedLanguages = (0, builder_util_1.asArray)(platformSpecificBuildOptions.electronLanguages || config.electronLanguages);
    if (!wantedLanguages.length) {
        return;
    }
    const { dir, langFileExt } = getLocalesConfig(options);
    // noinspection SpellCheckingInspection
    await bluebird_lst_1.default.map((0, fs_extra_1.readdir)(dir), file => {
        if (!file.endsWith(langFileExt)) {
            return;
        }
        const language = file.substring(0, file.length - langFileExt.length);
        if (!wantedLanguages.includes(language)) {
            return fs.rm(path.join(dir, file), { recursive: true, force: true });
        }
        return;
    }, fs_1.CONCURRENCY);
    function getLocalesConfig(options) {
        const { appOutDir, packager } = options;
        if (packager.platform === index_1.Platform.MAC) {
            return { dir: packager.getResourcesDir(appOutDir), langFileExt: ".lproj" };
        }
        else {
            return { dir: path.join(packager.getResourcesDir(appOutDir), "..", "locales"), langFileExt: ".pak" };
        }
    }
}
class ElectronFramework {
    constructor(name, version, distMacOsAppName) {
        this.name = name;
        this.version = version;
        this.distMacOsAppName = distMacOsAppName;
        // noinspection JSUnusedGlobalSymbols
        this.macOsDefaultTargets = ["zip", "dmg"];
        // noinspection JSUnusedGlobalSymbols
        this.defaultAppIdPrefix = "com.electron.";
        // noinspection JSUnusedGlobalSymbols
        this.isCopyElevateHelper = true;
        // noinspection JSUnusedGlobalSymbols
        this.isNpmRebuildRequired = true;
    }
    getDefaultIcon(platform) {
        if (platform === index_1.Platform.LINUX) {
            return path.join((0, pathManager_1.getTemplatePath)("icons"), "electron-linux");
        }
        else {
            // default icon is embedded into app skeleton
            return null;
        }
    }
    async prepareApplicationStageDirectory(options) {
        await unpack(options, createDownloadOpts(options.packager.config, options.platformName, options.arch, this.version), this.distMacOsAppName);
        if (options.packager.config.downloadAlternateFFmpeg) {
            await (0, injectFFMPEG_1.default)(options, this.version);
        }
    }
    beforeCopyExtraFiles(options) {
        return beforeCopyExtraFiles(options);
    }
}
async function createElectronFrameworkSupport(configuration, packager) {
    let version = configuration.electronVersion;
    if (version == null) {
        // for prepacked app asar no dev deps in the app.asar
        if (packager.isPrepackedAppAsar) {
            version = await (0, electronVersion_1.getElectronVersionFromInstalled)(packager.projectDir);
            if (version == null) {
                throw new Error(`Cannot compute electron version for prepacked asar`);
            }
        }
        else {
            version = await (0, electronVersion_1.computeElectronVersion)(packager.projectDir);
        }
        configuration.electronVersion = version;
    }
    const branding = createBrandingOpts(configuration);
    return new ElectronFramework(branding.projectName, version, `${branding.productName}.app`);
}
exports.createElectronFrameworkSupport = createElectronFrameworkSupport;
async function unpack(prepareOptions, options, distMacOsAppName) {
    const { packager, appOutDir, platformName } = prepareOptions;
    const electronDist = packager.config.electronDist;
    let dist = typeof electronDist === "function" ? electronDist(prepareOptions) : electronDist;
    if (dist != null) {
        const zipFile = `electron-v${options.version}-${platformName}-${options.arch}.zip`;
        const resolvedDist = path.isAbsolute(dist) ? dist : path.resolve(packager.projectDir, dist);
        if ((await (0, fs_1.statOrNull)(path.join(resolvedDist, zipFile))) != null) {
            builder_util_1.log.info({ resolvedDist, zipFile }, "resolved electronDist");
            options.cache = resolvedDist;
            dist = null;
        }
    }
    let isFullCleanup = false;
    if (dist == null) {
        await (0, builder_util_1.executeAppBuilder)(["unpack-electron", "--configuration", JSON.stringify([options]), "--output", appOutDir, "--distMacOsAppName", distMacOsAppName]);
    }
    else {
        isFullCleanup = true;
        const source = packager.getElectronSrcDir(dist);
        const destination = packager.getElectronDestinationDir(appOutDir);
        builder_util_1.log.info({ source, destination }, "copying Electron");
        await (0, fs_extra_1.emptyDir)(appOutDir);
        await (0, fs_1.copyDir)(source, destination, {
            isUseHardLink: fs_1.DO_NOT_USE_HARD_LINKS,
        });
    }
    await cleanupAfterUnpack(prepareOptions, distMacOsAppName, isFullCleanup);
}
function cleanupAfterUnpack(prepareOptions, distMacOsAppName, isFullCleanup) {
    const out = prepareOptions.appOutDir;
    const isMac = prepareOptions.packager.platform === index_1.Platform.MAC;
    const resourcesPath = isMac ? path.join(out, distMacOsAppName, "Contents", "Resources") : path.join(out, "resources");
    return Promise.all([
        isFullCleanup ? (0, fs_1.unlinkIfExists)(path.join(resourcesPath, "default_app.asar")) : Promise.resolve(),
        isFullCleanup ? (0, fs_1.unlinkIfExists)(path.join(out, "version")) : Promise.resolve(),
        isMac
            ? Promise.resolve()
            : (0, fs_extra_1.rename)(path.join(out, "LICENSE"), path.join(out, "LICENSE.electron.txt")).catch(() => {
                /* ignore */
            }),
    ]);
}
//# sourceMappingURL=ElectronFramework.js.map