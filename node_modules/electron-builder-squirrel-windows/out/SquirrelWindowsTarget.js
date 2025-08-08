"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const filename_1 = require("app-builder-lib/out/util/filename");
const builder_util_1 = require("builder-util");
const binDownload_1 = require("app-builder-lib/out/binDownload");
const app_builder_lib_1 = require("app-builder-lib");
const path = require("path");
const squirrelPack_1 = require("./squirrelPack");
class SquirrelWindowsTarget extends app_builder_lib_1.Target {
    constructor(packager, outDir) {
        super("squirrel");
        this.packager = packager;
        this.outDir = outDir;
        //tslint:disable-next-line:no-object-literal-type-assertion
        this.options = { ...this.packager.platformSpecificBuildOptions, ...this.packager.config.squirrelWindows };
    }
    async build(appOutDir, arch) {
        const packager = this.packager;
        const version = packager.appInfo.version;
        const sanitizedName = (0, filename_1.sanitizeFileName)(this.appName);
        // tslint:disable-next-line:no-invalid-template-strings
        const setupFile = packager.expandArtifactNamePattern(this.options, "exe", arch, "${productName} Setup ${version}.${ext}");
        const packageFile = `${sanitizedName}-${(0, squirrelPack_1.convertVersion)(version)}-full.nupkg`;
        const installerOutDir = path.join(this.outDir, `squirrel-windows${(0, app_builder_lib_1.getArchSuffix)(arch)}`);
        const artifactPath = path.join(installerOutDir, setupFile);
        await packager.info.callArtifactBuildStarted({
            targetPresentableName: "Squirrel.Windows",
            file: artifactPath,
            arch,
        });
        if (arch === app_builder_lib_1.Arch.ia32) {
            builder_util_1.log.warn("For windows consider only distributing 64-bit or use nsis target, see https://github.com/electron-userland/electron-builder/issues/359#issuecomment-214851130");
        }
        const distOptions = await this.computeEffectiveDistOptions();
        const squirrelBuilder = new squirrelPack_1.SquirrelBuilder(distOptions, installerOutDir, packager);
        await squirrelBuilder.buildInstaller({ setupFile, packageFile }, appOutDir, this.outDir, arch);
        await packager.info.callArtifactBuildCompleted({
            file: artifactPath,
            target: this,
            arch,
            safeArtifactName: `${sanitizedName}-Setup-${version}${(0, app_builder_lib_1.getArchSuffix)(arch)}.exe`,
            packager: this.packager,
        });
        const packagePrefix = `${this.appName}-${(0, squirrelPack_1.convertVersion)(version)}-`;
        packager.info.dispatchArtifactCreated({
            file: path.join(installerOutDir, `${packagePrefix}full.nupkg`),
            target: this,
            arch,
            packager,
        });
        if (distOptions.remoteReleases != null) {
            packager.info.dispatchArtifactCreated({
                file: path.join(installerOutDir, `${packagePrefix}delta.nupkg`),
                target: this,
                arch,
                packager,
            });
        }
        packager.info.dispatchArtifactCreated({
            file: path.join(installerOutDir, "RELEASES"),
            target: this,
            arch,
            packager,
        });
    }
    get appName() {
        return this.options.name || this.packager.appInfo.name;
    }
    async computeEffectiveDistOptions() {
        const packager = this.packager;
        let iconUrl = this.options.iconUrl;
        if (iconUrl == null) {
            const info = await packager.info.repositoryInfo;
            if (info != null) {
                iconUrl = `https://github.com/${info.user}/${info.project}/blob/master/${packager.info.relativeBuildResourcesDirname}/icon.ico?raw=true`;
            }
            if (iconUrl == null) {
                throw new builder_util_1.InvalidConfigurationError("squirrelWindows.iconUrl is not specified, please see https://www.electron.build/configuration/squirrel-windows#SquirrelWindowsOptions-iconUrl");
            }
        }
        checkConflictingOptions(this.options);
        const appInfo = packager.appInfo;
        const projectUrl = await appInfo.computePackageUrl();
        const appName = this.appName;
        const options = {
            name: appName,
            productName: this.options.name || appInfo.productName,
            appId: this.options.useAppIdAsId ? appInfo.id : appName,
            version: appInfo.version,
            description: appInfo.description,
            // better to explicitly set to empty string, to avoid any nugget errors
            authors: appInfo.companyName || "",
            iconUrl,
            extraMetadataSpecs: projectUrl == null ? null : `\n    <projectUrl>${projectUrl}</projectUrl>`,
            copyright: appInfo.copyright,
            packageCompressionLevel: parseInt((process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || packager.compression === "store" ? 0 : 9), 10),
            vendorPath: await (0, binDownload_1.getBinFromUrl)("Squirrel.Windows", "1.9.0", "zJHk4CMATM7jHJ2ojRH1n3LkOnaIezDk5FAzJmlSEQSiEdRuB4GGLCegLDtsRCakfHIVfKh3ysJHLjynPkXwhQ=="),
            ...this.options,
        };
        if ((0, builder_util_1.isEmptyOrSpaces)(options.description)) {
            options.description = options.productName;
        }
        if (options.remoteToken == null) {
            options.remoteToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
        }
        if (!("loadingGif" in options)) {
            const resourceList = await packager.resourceList;
            if (resourceList.includes("install-spinner.gif")) {
                options.loadingGif = path.join(packager.buildResourcesDir, "install-spinner.gif");
            }
        }
        if (this.options.remoteReleases === true) {
            const info = await packager.info.repositoryInfo;
            if (info == null) {
                builder_util_1.log.warn("remoteReleases set to true, but cannot get repository info");
            }
            else {
                options.remoteReleases = `https://github.com/${info.user}/${info.project}`;
                builder_util_1.log.info({ remoteReleases: options.remoteReleases }, `remoteReleases is set`);
            }
        }
        return options;
    }
}
exports.default = SquirrelWindowsTarget;
function checkConflictingOptions(options) {
    for (const name of ["outputDirectory", "appDirectory", "exe", "fixUpPaths", "usePackageJson", "extraFileSpecs", "extraMetadataSpecs", "skipUpdateIcon", "setupExe"]) {
        if (name in options) {
            throw new builder_util_1.InvalidConfigurationError(`Option ${name} is ignored, do not specify it.`);
        }
    }
    if ("noMsi" in options) {
        builder_util_1.log.warn(`noMsi is deprecated, please specify as "msi": true if you want to create an MSI installer`);
        options.msi = !options.noMsi;
    }
    const msi = options.msi;
    if (msi != null && typeof msi !== "boolean") {
        throw new builder_util_1.InvalidConfigurationError(`msi expected to be boolean value, but string '"${msi}"' was specified`);
    }
}
//# sourceMappingURL=SquirrelWindowsTarget.js.map