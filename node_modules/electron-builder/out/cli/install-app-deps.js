#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installAppDeps = exports.configureInstallAppDepsCommand = void 0;
const electronVersion_1 = require("app-builder-lib/out/electron/electronVersion");
const config_1 = require("app-builder-lib/out/util/config");
const yarn_1 = require("app-builder-lib/out/util/yarn");
const version_1 = require("app-builder-lib/out/version");
const packageDependencies_1 = require("app-builder-lib/out/util/packageDependencies");
const builder_util_1 = require("builder-util");
const promise_1 = require("builder-util/out/promise");
const fs_extra_1 = require("fs-extra");
const lazy_val_1 = require("lazy-val");
const path = require("path");
const read_config_file_1 = require("read-config-file");
const yargs = require("yargs");
/** @internal */
function configureInstallAppDepsCommand(yargs) {
    // https://github.com/yargs/yargs/issues/760
    // demandOption is required to be set
    return yargs
        .parserConfiguration({
        "camel-case-expansion": false,
    })
        .option("platform", {
        choices: ["linux", "darwin", "win32"],
        default: process.platform,
        description: "The target platform",
    })
        .option("arch", {
        choices: (0, builder_util_1.getArchCliNames)().concat("all"),
        default: process.arch === "arm" ? "armv7l" : process.arch,
        description: "The target arch",
    });
}
exports.configureInstallAppDepsCommand = configureInstallAppDepsCommand;
/** @internal */
async function installAppDeps(args) {
    try {
        builder_util_1.log.info({ version: version_1.PACKAGE_VERSION }, "electron-builder");
    }
    catch (e) {
        // error in dev mode without babel
        if (!(e instanceof ReferenceError)) {
            throw e;
        }
    }
    const projectDir = process.cwd();
    const packageMetadata = new lazy_val_1.Lazy(() => (0, read_config_file_1.orNullIfFileNotExist)((0, fs_extra_1.readJson)(path.join(projectDir, "package.json"))));
    const config = await (0, config_1.getConfig)(projectDir, null, null, packageMetadata);
    const [appDir, version] = await Promise.all([
        (0, config_1.computeDefaultAppDirectory)(projectDir, (0, builder_util_1.use)(config.directories, it => it.app)),
        (0, electronVersion_1.getElectronVersion)(projectDir, config),
    ]);
    // if two package.json — force full install (user wants to install/update app deps in addition to dev)
    await (0, yarn_1.installOrRebuild)(config, appDir, {
        frameworkInfo: { version, useCustomDist: true },
        platform: args.platform,
        arch: args.arch,
        productionDeps: (0, packageDependencies_1.createLazyProductionDeps)(appDir, null),
    }, appDir !== projectDir);
}
exports.installAppDeps = installAppDeps;
function main() {
    return installAppDeps(configureInstallAppDepsCommand(yargs).argv);
}
if (require.main === module) {
    builder_util_1.log.warn("please use as subcommand: electron-builder install-app-deps");
    main().catch(promise_1.printErrorAndExit);
}
//# sourceMappingURL=install-app-deps.js.map