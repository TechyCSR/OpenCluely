"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WinPackager = void 0;
const bluebird_lst_1 = require("bluebird-lst");
const builder_util_1 = require("builder-util");
const builder_util_runtime_1 = require("builder-util-runtime");
const fs_1 = require("builder-util/out/fs");
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const isCI = require("is-ci");
const lazy_val_1 = require("lazy-val");
const path = require("path");
const codesign_1 = require("./codeSign/codesign");
const windowsCodeSign_1 = require("./codeSign/windowsCodeSign");
const core_1 = require("./core");
const platformPackager_1 = require("./platformPackager");
const NsisTarget_1 = require("./targets/nsis/NsisTarget");
const nsisUtil_1 = require("./targets/nsis/nsisUtil");
const WebInstallerTarget_1 = require("./targets/nsis/WebInstallerTarget");
const targetFactory_1 = require("./targets/targetFactory");
const cacheManager_1 = require("./util/cacheManager");
const flags_1 = require("./util/flags");
const timer_1 = require("./util/timer");
const vm_1 = require("./vm/vm");
const wine_1 = require("./wine");
class WinPackager extends platformPackager_1.PlatformPackager {
    get isForceCodeSigningVerification() {
        return this.platformSpecificBuildOptions.verifyUpdateCodeSignature !== false;
    }
    constructor(info) {
        super(info, core_1.Platform.WINDOWS);
        this.cscInfo = new lazy_val_1.Lazy(() => {
            const platformSpecificBuildOptions = this.platformSpecificBuildOptions;
            if (platformSpecificBuildOptions.certificateSubjectName != null || platformSpecificBuildOptions.certificateSha1 != null) {
                return this.vm.value
                    .then(vm => (0, windowsCodeSign_1.getCertificateFromStoreInfo)(platformSpecificBuildOptions, vm))
                    .catch((e) => {
                    // https://github.com/electron-userland/electron-builder/pull/2397
                    if (platformSpecificBuildOptions.sign == null) {
                        throw e;
                    }
                    else {
                        builder_util_1.log.debug({ error: e }, "getCertificateFromStoreInfo error");
                        return null;
                    }
                });
            }
            const certificateFile = platformSpecificBuildOptions.certificateFile;
            if (certificateFile != null) {
                const certificatePassword = this.getCscPassword();
                return Promise.resolve({
                    file: certificateFile,
                    password: certificatePassword == null ? null : certificatePassword.trim(),
                });
            }
            const cscLink = this.getCscLink("WIN_CSC_LINK");
            if (cscLink == null) {
                return Promise.resolve(null);
            }
            return ((0, codesign_1.importCertificate)(cscLink, this.info.tempDirManager, this.projectDir)
                // before then
                .catch((e) => {
                if (e instanceof builder_util_1.InvalidConfigurationError) {
                    throw new builder_util_1.InvalidConfigurationError(`Env WIN_CSC_LINK is not correct, cannot resolve: ${e.message}`);
                }
                else {
                    throw e;
                }
            })
                .then(path => {
                return {
                    file: path,
                    password: this.getCscPassword(),
                };
            }));
        });
        this._iconPath = new lazy_val_1.Lazy(() => this.getOrConvertIcon("ico"));
        this.vm = new lazy_val_1.Lazy(() => (process.platform === "win32" ? Promise.resolve(new vm_1.VmManager()) : (0, vm_1.getWindowsVm)(this.debugLogger)));
        this.computedPublisherName = new lazy_val_1.Lazy(async () => {
            const publisherName = this.platformSpecificBuildOptions.publisherName;
            if (publisherName === null) {
                return null;
            }
            else if (publisherName != null) {
                return (0, builder_util_1.asArray)(publisherName);
            }
            const certInfo = await this.lazyCertInfo.value;
            return certInfo == null ? null : [certInfo.commonName];
        });
        this.lazyCertInfo = new lazy_val_1.Lazy(async () => {
            const cscInfo = await this.cscInfo.value;
            if (cscInfo == null) {
                return null;
            }
            if ("subject" in cscInfo) {
                const bloodyMicrosoftSubjectDn = cscInfo.subject;
                return {
                    commonName: (0, builder_util_runtime_1.parseDn)(bloodyMicrosoftSubjectDn).get("CN"),
                    bloodyMicrosoftSubjectDn,
                };
            }
            const cscFile = cscInfo.file;
            if (cscFile == null) {
                return null;
            }
            return await (0, windowsCodeSign_1.getCertInfo)(cscFile, cscInfo.password || "");
        });
    }
    get defaultTarget() {
        return ["nsis"];
    }
    doGetCscPassword() {
        return (0, platformPackager_1.chooseNotNull)((0, platformPackager_1.chooseNotNull)(this.platformSpecificBuildOptions.certificatePassword, process.env.WIN_CSC_KEY_PASSWORD), super.doGetCscPassword());
    }
    createTargets(targets, mapper) {
        let copyElevateHelper;
        const getCopyElevateHelper = () => {
            if (copyElevateHelper == null) {
                copyElevateHelper = new nsisUtil_1.CopyElevateHelper();
            }
            return copyElevateHelper;
        };
        let helper;
        const getHelper = () => {
            if (helper == null) {
                helper = new nsisUtil_1.AppPackageHelper(getCopyElevateHelper());
            }
            return helper;
        };
        for (const name of targets) {
            if (name === core_1.DIR_TARGET) {
                continue;
            }
            if (name === "nsis" || name === "portable") {
                mapper(name, outDir => new NsisTarget_1.NsisTarget(this, outDir, name, getHelper()));
            }
            else if (name === "nsis-web") {
                // package file format differs from nsis target
                mapper(name, outDir => new WebInstallerTarget_1.WebInstallerTarget(this, path.join(outDir, name), name, new nsisUtil_1.AppPackageHelper(getCopyElevateHelper())));
            }
            else {
                const targetClass = (() => {
                    switch (name) {
                        case "squirrel":
                            try {
                                return require("electron-builder-squirrel-windows").default;
                            }
                            catch (e) {
                                throw new builder_util_1.InvalidConfigurationError(`Module electron-builder-squirrel-windows must be installed in addition to build Squirrel.Windows: ${e.stack || e}`);
                            }
                        case "appx":
                            return require("./targets/AppxTarget").default;
                        case "msi":
                            return require("./targets/MsiTarget").default;
                        case "msiwrapped":
                            return require("./targets/MsiWrappedTarget").default;
                        default:
                            return null;
                    }
                })();
                mapper(name, outDir => (targetClass === null ? (0, targetFactory_1.createCommonTarget)(name, outDir, this) : new targetClass(this, outDir, name)));
            }
        }
    }
    getIconPath() {
        return this._iconPath.value;
    }
    async sign(file, logMessagePrefix) {
        const signOptions = {
            path: file,
            name: this.appInfo.productName,
            site: await this.appInfo.computePackageUrl(),
            options: this.platformSpecificBuildOptions,
        };
        const cscInfo = await this.cscInfo.value;
        if (cscInfo == null) {
            if (this.platformSpecificBuildOptions.sign != null) {
                return (0, windowsCodeSign_1.sign)(signOptions, this);
            }
            else if (this.forceCodeSigning) {
                throw new builder_util_1.InvalidConfigurationError(`App is not signed and "forceCodeSigning" is set to true, please ensure that code signing configuration is correct, please see https://electron.build/code-signing`);
            }
            return false;
        }
        if (logMessagePrefix == null) {
            logMessagePrefix = "signing";
        }
        if ("file" in cscInfo) {
            builder_util_1.log.info({
                file: builder_util_1.log.filePath(file),
                certificateFile: cscInfo.file,
            }, logMessagePrefix);
        }
        else {
            const info = cscInfo;
            builder_util_1.log.info({
                file: builder_util_1.log.filePath(file),
                subject: info.subject,
                thumbprint: info.thumbprint,
                store: info.store,
                user: info.isLocalMachineStore ? "local machine" : "current user",
            }, logMessagePrefix);
        }
        return this.doSign({
            ...signOptions,
            cscInfo,
            options: {
                ...this.platformSpecificBuildOptions,
            },
        });
    }
    async doSign(options) {
        for (let i = 0; i < 3; i++) {
            try {
                await (0, windowsCodeSign_1.sign)(options, this);
                return true;
            }
            catch (e) {
                // https://github.com/electron-userland/electron-builder/issues/1414
                const message = e.message;
                if (message != null && message.includes("Couldn't resolve host name")) {
                    builder_util_1.log.warn({ error: message, attempt: i + 1 }, `cannot sign`);
                    continue;
                }
                throw e;
            }
        }
        return false;
    }
    async signAndEditResources(file, arch, outDir, internalName, requestedExecutionLevel) {
        const appInfo = this.appInfo;
        const files = [];
        const args = [
            file,
            "--set-version-string",
            "FileDescription",
            appInfo.productName,
            "--set-version-string",
            "ProductName",
            appInfo.productName,
            "--set-version-string",
            "LegalCopyright",
            appInfo.copyright,
            "--set-file-version",
            appInfo.shortVersion || appInfo.buildVersion,
            "--set-product-version",
            appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm(),
        ];
        if (internalName != null) {
            args.push("--set-version-string", "InternalName", internalName, "--set-version-string", "OriginalFilename", "");
        }
        if (requestedExecutionLevel != null && requestedExecutionLevel !== "asInvoker") {
            args.push("--set-requested-execution-level", requestedExecutionLevel);
        }
        (0, builder_util_1.use)(appInfo.companyName, it => args.push("--set-version-string", "CompanyName", it));
        (0, builder_util_1.use)(this.platformSpecificBuildOptions.legalTrademarks, it => args.push("--set-version-string", "LegalTrademarks", it));
        const iconPath = await this.getIconPath();
        (0, builder_util_1.use)(iconPath, it => {
            files.push(it);
            args.push("--set-icon", it);
        });
        const config = this.config;
        const cscInfoForCacheDigest = !(0, flags_1.isBuildCacheEnabled)() || isCI || config.electronDist != null ? null : await this.cscInfo.value;
        let buildCacheManager = null;
        // resources editing doesn't change executable for the same input and executed quickly - no need to complicate
        if (cscInfoForCacheDigest != null) {
            const cscFile = cscInfoForCacheDigest.file;
            if (cscFile != null) {
                files.push(cscFile);
            }
            const timer = (0, timer_1.time)("executable cache");
            const hash = (0, crypto_1.createHash)("sha512");
            hash.update(config.electronVersion || "no electronVersion");
            hash.update(JSON.stringify(this.platformSpecificBuildOptions));
            hash.update(JSON.stringify(args));
            hash.update(this.platformSpecificBuildOptions.certificateSha1 || "no certificateSha1");
            hash.update(this.platformSpecificBuildOptions.certificateSubjectName || "no subjectName");
            buildCacheManager = new cacheManager_1.BuildCacheManager(outDir, file, arch);
            if (await buildCacheManager.copyIfValid(await (0, cacheManager_1.digest)(hash, files))) {
                timer.end();
                return;
            }
            timer.end();
        }
        const timer = (0, timer_1.time)("wine&sign");
        // rcedit crashed of executed using wine, resourcehacker works
        if (process.platform === "win32" || process.platform === "darwin") {
            await (0, builder_util_1.executeAppBuilder)(["rcedit", "--args", JSON.stringify(args)], undefined /* child-process */, {}, 3 /* retry three times */);
        }
        else if (this.info.framework.name === "electron") {
            const vendorPath = await (0, windowsCodeSign_1.getSignVendorPath)();
            await (0, wine_1.execWine)(path.join(vendorPath, "rcedit-ia32.exe"), path.join(vendorPath, "rcedit-x64.exe"), args);
        }
        await this.sign(file);
        timer.end();
        if (buildCacheManager != null) {
            await buildCacheManager.save();
        }
    }
    shouldSignFile(file) {
        var _a;
        const shouldSignDll = this.platformSpecificBuildOptions.signDlls === true && file.endsWith(".dll");
        const shouldSignExplicit = !!((_a = this.platformSpecificBuildOptions.signExts) === null || _a === void 0 ? void 0 : _a.some(ext => file.endsWith(ext)));
        return shouldSignDll || shouldSignExplicit || file.endsWith(".exe");
    }
    createTransformerForExtraFiles(packContext) {
        if (this.platformSpecificBuildOptions.signAndEditExecutable === false) {
            return null;
        }
        return file => {
            if (this.shouldSignFile(file)) {
                const parentDir = path.dirname(file);
                if (parentDir !== packContext.appOutDir) {
                    return new fs_1.CopyFileTransformer(file => this.sign(file));
                }
            }
            return null;
        };
    }
    async signApp(packContext, isAsar) {
        const exeFileName = `${this.appInfo.productFilename}.exe`;
        if (this.platformSpecificBuildOptions.signAndEditExecutable === false) {
            return false;
        }
        await bluebird_lst_1.default.map((0, promises_1.readdir)(packContext.appOutDir), (file) => {
            if (file === exeFileName) {
                return this.signAndEditResources(path.join(packContext.appOutDir, exeFileName), packContext.arch, packContext.outDir, path.basename(exeFileName, ".exe"), this.platformSpecificBuildOptions.requestedExecutionLevel);
            }
            else if (this.shouldSignFile(file)) {
                return this.sign(path.join(packContext.appOutDir, file));
            }
            return null;
        });
        if (!isAsar) {
            return true;
        }
        const filesPromise = (filepath) => {
            const outDir = path.join(packContext.appOutDir, ...filepath);
            return (0, fs_1.walk)(outDir, (file, stat) => stat.isDirectory() || this.shouldSignFile(file));
        };
        const filesToSign = await Promise.all([filesPromise(["resources", "app.asar.unpacked"]), filesPromise(["swiftshader"])]);
        await bluebird_lst_1.default.map(filesToSign.flat(1), file => this.sign(file), { concurrency: 4 });
        return true;
    }
}
exports.WinPackager = WinPackager;
//# sourceMappingURL=winPackager.js.map