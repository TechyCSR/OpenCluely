"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builder_util_1 = require("builder-util");
const fs_1 = require("builder-util/out/fs");
const fs_extra_1 = require("fs-extra");
const promises_1 = require("fs/promises");
const path = require("path");
const appInfo_1 = require("../appInfo");
const core_1 = require("../core");
const errorMessages = require("../errorMessages");
const appBuilder_1 = require("../util/appBuilder");
const bundledTool_1 = require("../util/bundledTool");
const macosVersion_1 = require("../util/macosVersion");
const pathManager_1 = require("../util/pathManager");
const LinuxTargetHelper_1 = require("./LinuxTargetHelper");
const tools_1 = require("./tools");
const hash_1 = require("../util/hash");
const PublishManager_1 = require("../publish/PublishManager");
const builder_util_2 = require("builder-util");
class FpmTarget extends core_1.Target {
    constructor(name, packager, helper, outDir) {
        super(name, false);
        this.packager = packager;
        this.helper = helper;
        this.outDir = outDir;
        this.options = { ...this.packager.platformSpecificBuildOptions, ...this.packager.config[this.name] };
        this.scriptFiles = this.createScripts();
    }
    async createScripts() {
        const defaultTemplatesDir = (0, pathManager_1.getTemplatePath)("linux");
        const packager = this.packager;
        const templateOptions = {
            // old API compatibility
            executable: packager.executableName,
            sanitizedProductName: packager.appInfo.sanitizedProductName,
            productFilename: packager.appInfo.productFilename,
            ...packager.platformSpecificBuildOptions,
        };
        function getResource(value, defaultFile) {
            if (value == null) {
                return path.join(defaultTemplatesDir, defaultFile);
            }
            return path.resolve(packager.projectDir, value);
        }
        return await Promise.all([
            writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterInstall, "after-install.tpl"), templateOptions),
            writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterRemove, "after-remove.tpl"), templateOptions),
        ]);
    }
    checkOptions() {
        return this.computeFpmMetaInfoOptions();
    }
    async computeFpmMetaInfoOptions() {
        var _a;
        const packager = this.packager;
        const projectUrl = await packager.appInfo.computePackageUrl();
        const errors = [];
        if (projectUrl == null) {
            errors.push("Please specify project homepage, see https://electron.build/configuration/configuration#Metadata-homepage");
        }
        const options = this.options;
        let author = options.maintainer;
        if (author == null) {
            const a = packager.info.metadata.author;
            if (a == null || a.email == null) {
                errors.push(errorMessages.authorEmailIsMissed);
            }
            else {
                author = `${a.name} <${a.email}>`;
            }
        }
        if (errors.length > 0) {
            throw new Error(errors.join("\n\n"));
        }
        return {
            name: (_a = options.packageName) !== null && _a !== void 0 ? _a : this.packager.appInfo.linuxPackageName,
            maintainer: author,
            url: projectUrl,
            vendor: options.vendor || author,
        };
    }
    async build(appOutDir, arch) {
        var _a;
        const target = this.name;
        // tslint:disable:no-invalid-template-strings
        let nameFormat = "${name}-${version}-${arch}.${ext}";
        let isUseArchIfX64 = false;
        if (target === "deb") {
            nameFormat = "${name}_${version}_${arch}.${ext}";
            isUseArchIfX64 = true;
        }
        else if (target === "rpm") {
            nameFormat = "${name}-${version}.${arch}.${ext}";
            isUseArchIfX64 = true;
        }
        const packager = this.packager;
        const artifactName = packager.expandArtifactNamePattern(this.options, target, arch, nameFormat, !isUseArchIfX64);
        const artifactPath = path.join(this.outDir, artifactName);
        await packager.info.callArtifactBuildStarted({
            targetPresentableName: target,
            file: artifactPath,
            arch,
        });
        await (0, fs_1.unlinkIfExists)(artifactPath);
        if (packager.packagerOptions.prepackaged != null) {
            await (0, promises_1.mkdir)(this.outDir, { recursive: true });
        }
        const publishConfig = this.supportsAutoUpdate(target)
            ? await (0, PublishManager_1.getAppUpdatePublishConfiguration)(packager, arch, false /* in any case validation will be done on publish */)
            : null;
        if (publishConfig != null) {
            const linuxDistType = this.packager.packagerOptions.prepackaged || path.join(this.outDir, `linux${(0, builder_util_1.getArchSuffix)(arch)}-unpacked`);
            const resourceDir = packager.getResourcesDir(linuxDistType);
            builder_util_1.log.info({ resourceDir }, `adding autoupdate files for: ${target}. (Beta feature)`);
            await (0, fs_extra_1.outputFile)(path.join(resourceDir, "app-update.yml"), (0, builder_util_1.serializeToYaml)(publishConfig));
            // Extra file needed for auto-updater to detect installation method
            await (0, fs_extra_1.outputFile)(path.join(resourceDir, "package-type"), target);
        }
        const scripts = await this.scriptFiles;
        const appInfo = packager.appInfo;
        const options = this.options;
        const synopsis = options.synopsis;
        const args = [
            "--architecture",
            (0, builder_util_1.toLinuxArchString)(arch, target),
            "--after-install",
            scripts[0],
            "--after-remove",
            scripts[1],
            "--description",
            (0, appInfo_1.smarten)(target === "rpm" ? this.helper.getDescription(options) : `${synopsis || ""}\n ${this.helper.getDescription(options)}`),
            "--version",
            this.helper.getSanitizedVersion(target),
            "--package",
            artifactPath,
        ];
        (0, appBuilder_1.objectToArgs)(args, (await this.computeFpmMetaInfoOptions()));
        const packageCategory = options.packageCategory;
        if (packageCategory != null) {
            args.push("--category", packageCategory);
        }
        if (target === "deb") {
            args.push("--deb-priority", (_a = options.priority) !== null && _a !== void 0 ? _a : "optional");
        }
        else if (target === "rpm") {
            if (synopsis != null) {
                args.push("--rpm-summary", (0, appInfo_1.smarten)(synopsis));
            }
        }
        const fpmConfiguration = {
            args,
            target,
        };
        if (options.compression != null) {
            fpmConfiguration.compression = options.compression;
        }
        // noinspection JSDeprecatedSymbols
        const depends = options.depends;
        if (depends != null) {
            if (Array.isArray(depends)) {
                fpmConfiguration.customDepends = depends;
            }
            else {
                // noinspection SuspiciousTypeOfGuard
                if (typeof depends === "string") {
                    fpmConfiguration.customDepends = [depends];
                }
                else {
                    throw new Error(`depends must be Array or String, but specified as: ${depends}`);
                }
            }
        }
        if (target === "deb") {
            const recommends = options.recommends;
            if (recommends) {
                fpmConfiguration.customRecommends = (0, builder_util_1.asArray)(recommends);
            }
        }
        (0, builder_util_1.use)(packager.info.metadata.license, it => args.push("--license", it));
        (0, builder_util_1.use)(appInfo.buildNumber, it => args.push("--iteration", 
        // dashes are not supported for iteration in older versions of fpm
        // https://github.com/jordansissel/fpm/issues/1833
        it.split("-").join("_")));
        (0, builder_util_1.use)(options.fpm, it => args.push(...it));
        args.push(`${appOutDir}/=${LinuxTargetHelper_1.installPrefix}/${appInfo.sanitizedProductName}`);
        for (const icon of await this.helper.icons) {
            const extWithDot = path.extname(icon.file);
            const sizeName = extWithDot === ".svg" ? "scalable" : `${icon.size}x${icon.size}`;
            args.push(`${icon.file}=/usr/share/icons/hicolor/${sizeName}/apps/${packager.executableName}${extWithDot}`);
        }
        const mimeTypeFilePath = await this.helper.mimeTypeFiles;
        if (mimeTypeFilePath != null) {
            args.push(`${mimeTypeFilePath}=/usr/share/mime/packages/${packager.executableName}.xml`);
        }
        const desktopFilePath = await this.helper.writeDesktopEntry(this.options);
        args.push(`${desktopFilePath}=/usr/share/applications/${packager.executableName}.desktop`);
        if (packager.packagerOptions.effectiveOptionComputed != null && (await packager.packagerOptions.effectiveOptionComputed([args, desktopFilePath]))) {
            return;
        }
        const env = {
            ...process.env,
            SZA_PATH: await (0, builder_util_2.getPath7za)(),
            SZA_COMPRESSION_LEVEL: packager.compression === "store" ? "0" : "9",
        };
        // rpmbuild wants directory rpm with some default config files. Even if we can use dylibbundler, path to such config files are not changed (we need to replace in the binary)
        // so, for now, brew install rpm is still required.
        if (target !== "rpm" && (await (0, macosVersion_1.isMacOsSierra)())) {
            const linuxToolsPath = await (0, tools_1.getLinuxToolsPath)();
            Object.assign(env, {
                PATH: (0, bundledTool_1.computeEnv)(process.env.PATH, [path.join(linuxToolsPath, "bin")]),
                DYLD_LIBRARY_PATH: (0, bundledTool_1.computeEnv)(process.env.DYLD_LIBRARY_PATH, [path.join(linuxToolsPath, "lib")]),
            });
        }
        await (0, builder_util_1.executeAppBuilder)(["fpm", "--configuration", JSON.stringify(fpmConfiguration)], undefined, { env });
        let info = {
            file: artifactPath,
            target: this,
            arch,
            packager,
        };
        if (publishConfig != null) {
            info = {
                ...info,
                safeArtifactName: packager.computeSafeArtifactName(artifactName, target, arch, !isUseArchIfX64),
                isWriteUpdateInfo: true,
                updateInfo: {
                    sha512: await (0, hash_1.hashFile)(artifactPath),
                    size: (await (0, fs_extra_1.stat)(artifactPath)).size,
                },
            };
        }
        await packager.info.callArtifactBuildCompleted(info);
    }
    supportsAutoUpdate(target) {
        return ["deb", "rpm"].includes(target);
    }
}
exports.default = FpmTarget;
async function writeConfigFile(tmpDir, templatePath, options) {
    //noinspection JSUnusedLocalSymbols
    function replacer(match, p1) {
        if (p1 in options) {
            return options[p1];
        }
        else {
            throw new Error(`Macro ${p1} is not defined`);
        }
    }
    const config = (await (0, promises_1.readFile)(templatePath, "utf8")).replace(/\${([a-zA-Z]+)}/g, replacer).replace(/<%=([a-zA-Z]+)%>/g, (match, p1) => {
        builder_util_1.log.warn("<%= varName %> is deprecated, please use ${varName} instead");
        return replacer(match, p1.trim());
    });
    const outputPath = await tmpDir.getTempFile({ suffix: path.basename(templatePath, ".tpl") });
    await (0, fs_extra_1.outputFile)(outputPath, config);
    return outputPath;
}
//# sourceMappingURL=FpmTarget.js.map