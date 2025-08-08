"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SquirrelBuilder = exports.convertVersion = void 0;
const builder_util_1 = require("builder-util");
const fs_1 = require("builder-util/out/fs");
const archive_1 = require("app-builder-lib/out/targets/archive");
const wine_1 = require("app-builder-lib/out/wine");
const fs_extra_1 = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const fs = require("fs/promises");
function convertVersion(version) {
    const parts = version.split("-");
    const mainVersion = parts.shift();
    if (parts.length > 0) {
        return [mainVersion, parts.join("-").replace(/\./g, "")].join("-");
    }
    else {
        return mainVersion;
    }
}
exports.convertVersion = convertVersion;
function syncReleases(outputDirectory, options) {
    builder_util_1.log.info("syncing releases to build delta package");
    const args = (0, wine_1.prepareWindowsExecutableArgs)(["-u", options.remoteReleases, "-r", outputDirectory], path.join(options.vendorPath, "SyncReleases.exe"));
    if (options.remoteToken) {
        args.push("-t", options.remoteToken);
    }
    return (0, builder_util_1.spawn)(process.platform === "win32" ? path.join(options.vendorPath, "SyncReleases.exe") : "mono", args);
}
class SquirrelBuilder {
    constructor(options, outputDirectory, packager) {
        this.options = options;
        this.outputDirectory = outputDirectory;
        this.packager = packager;
    }
    async buildInstaller(outFileNames, appOutDir, outDir, arch) {
        const packager = this.packager;
        const dirToArchive = await packager.info.tempDirManager.createTempDir({ prefix: "squirrel-windows" });
        const outputDirectory = this.outputDirectory;
        const options = this.options;
        const appUpdate = path.join(dirToArchive, "Update.exe");
        await Promise.all([
            (0, fs_1.copyFile)(path.join(options.vendorPath, "Update.exe"), appUpdate).then(() => packager.sign(appUpdate)),
            Promise.all([
                fs.rm(`${outputDirectory.replace(/\\/g, "/")}/*-full.nupkg`, { recursive: true, force: true }),
                fs.rm(path.join(outputDirectory, "RELEASES"), { recursive: true, force: true }),
            ]).then(() => fs.mkdir(outputDirectory, { recursive: true })),
        ]);
        if ((0, builder_util_1.isEmptyOrSpaces)(options.description)) {
            options.description = options.productName;
        }
        if (options.remoteReleases) {
            await syncReleases(outputDirectory, options);
        }
        const version = convertVersion(options.version);
        const nupkgPath = path.join(outputDirectory, outFileNames.packageFile);
        const setupPath = path.join(outputDirectory, outFileNames.setupFile);
        await Promise.all([
            pack(options, appOutDir, appUpdate, nupkgPath, version, packager),
            (0, fs_1.copyFile)(path.join(options.vendorPath, "Setup.exe"), setupPath),
            (0, fs_1.copyFile)(options.loadingGif ? path.resolve(packager.projectDir, options.loadingGif) : path.join(options.vendorPath, "install-spinner.gif"), path.join(dirToArchive, "background.gif")),
        ]);
        // releasify can be called only after pack nupkg and nupkg must be in the final output directory (where other old version nupkg can be located)
        await this.releasify(nupkgPath, outFileNames.packageFile).then(it => (0, fs_extra_1.writeFile)(path.join(dirToArchive, "RELEASES"), it));
        const embeddedArchiveFile = await this.createEmbeddedArchiveFile(nupkgPath, dirToArchive);
        await (0, wine_1.execWine)(path.join(options.vendorPath, "WriteZipToSetup.exe"), null, [setupPath, embeddedArchiveFile]);
        await packager.signAndEditResources(setupPath, arch, outDir);
        if (options.msi && process.platform === "win32") {
            const outFile = outFileNames.setupFile.replace(".exe", ".msi");
            await msi(options, nupkgPath, setupPath, outputDirectory, outFile);
            // rcedit can only edit .exe resources
            await packager.sign(path.join(outputDirectory, outFile));
        }
    }
    async releasify(nupkgPath, packageName) {
        const args = ["--releasify", nupkgPath, "--releaseDir", this.outputDirectory];
        const out = (await execSw(this.options, args)).trim();
        if (builder_util_1.debug.enabled) {
            (0, builder_util_1.debug)(`Squirrel output: ${out}`);
        }
        const lines = out.split("\n");
        for (let i = lines.length - 1; i > -1; i--) {
            const line = lines[i];
            if (line.includes(packageName)) {
                return line.trim();
            }
        }
        throw new Error(`Invalid output, cannot find last release entry, output: ${out}`);
    }
    async createEmbeddedArchiveFile(nupkgPath, dirToArchive) {
        const embeddedArchiveFile = await this.packager.getTempFile("setup.zip");
        const path7za = await (0, builder_util_1.getPath7za)();
        await (0, builder_util_1.exec)(path7za, (0, archive_1.compute7zCompressArgs)("zip", {
            isRegularFile: true,
            compression: this.packager.compression,
        }).concat(embeddedArchiveFile, "."), {
            cwd: dirToArchive,
        });
        await (0, builder_util_1.exec)(path7za, (0, archive_1.compute7zCompressArgs)("zip", {
            isRegularFile: true,
            compression: "store" /* nupkg is already compressed */,
        }).concat(embeddedArchiveFile, nupkgPath));
        return embeddedArchiveFile;
    }
}
exports.SquirrelBuilder = SquirrelBuilder;
async function pack(options, directory, updateFile, outFile, version, packager) {
    // SW now doesn't support 0-level nupkg compressed files. It means that we are forced to use level 1 if store level requested.
    const archive = archiver("zip", { zlib: { level: Math.max(1, options.packageCompressionLevel == null ? 9 : options.packageCompressionLevel) } });
    const archiveOut = (0, fs_extra_1.createWriteStream)(outFile);
    const archivePromise = new Promise((resolve, reject) => {
        archive.on("error", reject);
        archiveOut.on("error", reject);
        archiveOut.on("close", resolve);
    });
    archive.pipe(archiveOut);
    const author = options.authors;
    const copyright = options.copyright || `Copyright © ${new Date().getFullYear()} ${author}`;
    const nuspecContent = `<?xml version="1.0"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>${options.appId}</id>
    <version>${version}</version>
    <title>${options.productName}</title>
    <authors>${author}</authors>
    <iconUrl>${options.iconUrl}</iconUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>${options.description}</description>
    <copyright>${copyright}</copyright>${options.extraMetadataSpecs || ""}
  </metadata>
</package>`;
    (0, builder_util_1.debug)(`Created NuSpec file:\n${nuspecContent}`);
    archive.append(nuspecContent.replace(/\n/, "\r\n"), { name: `${options.name}.nuspec` });
    //noinspection SpellCheckingInspection
    archive.append(`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/${options.name}.nuspec" Id="Re0" />
  <Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="/package/services/metadata/core-properties/1.psmdcp" Id="Re1" />
</Relationships>`.replace(/\n/, "\r\n"), { name: ".rels", prefix: "_rels" });
    //noinspection SpellCheckingInspection
    archive.append(`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="nuspec" ContentType="application/octet" />
  <Default Extension="pak" ContentType="application/octet" />
  <Default Extension="asar" ContentType="application/octet" />
  <Default Extension="bin" ContentType="application/octet" />
  <Default Extension="dll" ContentType="application/octet" />
  <Default Extension="exe" ContentType="application/octet" />
  <Default Extension="dat" ContentType="application/octet" />
  <Default Extension="psmdcp" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
  <Default Extension="diff" ContentType="application/octet" />
  <Default Extension="bsdiff" ContentType="application/octet" />
  <Default Extension="shasum" ContentType="text/plain" />
  <Default Extension="mp3" ContentType="audio/mpeg" />
  <Default Extension="node" ContentType="application/octet" />
</Types>`.replace(/\n/, "\r\n"), { name: "[Content_Types].xml" });
    archive.append(`<?xml version="1.0" encoding="utf-8"?>
<coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties">
  <dc:creator>${author}</dc:creator>
  <dc:description>${options.description}</dc:description>
  <dc:identifier>${options.appId}</dc:identifier>
  <version>${version}</version>
  <keywords/>
  <dc:title>${options.productName}</dc:title>
  <lastModifiedBy>NuGet, Version=2.8.50926.602, Culture=neutral, PublicKeyToken=null;Microsoft Windows NT 6.2.9200.0;.NET Framework 4</lastModifiedBy>
</coreProperties>`.replace(/\n/, "\r\n"), { name: "1.psmdcp", prefix: "package/services/metadata/core-properties" });
    archive.file(updateFile, { name: "Update.exe", prefix: "lib/net45" });
    await encodedZip(archive, directory, "lib/net45", options.vendorPath, packager);
    await archivePromise;
}
async function execSw(options, args) {
    return (0, builder_util_1.exec)(process.platform === "win32" ? path.join(options.vendorPath, "Update.com") : "mono", (0, wine_1.prepareWindowsExecutableArgs)(args, path.join(options.vendorPath, "Update-Mono.exe")), {
        env: {
            ...process.env,
            SZA_PATH: await (0, builder_util_1.getPath7za)(),
        },
    });
}
async function msi(options, nupkgPath, setupPath, outputDirectory, outFile) {
    const args = ["--createMsi", nupkgPath, "--bootstrapperExe", setupPath];
    await execSw(options, args);
    //noinspection SpellCheckingInspection
    await (0, builder_util_1.exec)(path.join(options.vendorPath, "candle.exe"), ["-nologo", "-ext", "WixNetFxExtension", "-out", "Setup.wixobj", "Setup.wxs"], {
        cwd: outputDirectory,
    });
    //noinspection SpellCheckingInspection
    await (0, builder_util_1.exec)(path.join(options.vendorPath, "light.exe"), ["-ext", "WixNetFxExtension", "-sval", "-out", outFile, "Setup.wixobj"], {
        cwd: outputDirectory,
    });
    //noinspection SpellCheckingInspection
    await Promise.all([
        (0, fs_extra_1.unlink)(path.join(outputDirectory, "Setup.wxs")),
        (0, fs_extra_1.unlink)(path.join(outputDirectory, "Setup.wixobj")),
        (0, fs_extra_1.unlink)(path.join(outputDirectory, outFile.replace(".msi", ".wixpdb"))).catch((e) => (0, builder_util_1.debug)(e.toString())),
    ]);
}
async function encodedZip(archive, dir, prefix, vendorPath, packager) {
    await (0, fs_1.walk)(dir, null, {
        isIncludeDir: true,
        consume: async (file, stats) => {
            if (stats.isDirectory()) {
                return;
            }
            const relativeSafeFilePath = file.substring(dir.length + 1).replace(/\\/g, "/");
            archive._append(file, {
                name: relativeSafeFilePath,
                prefix,
                stats,
            });
            // createExecutableStubForExe
            // https://github.com/Squirrel/Squirrel.Windows/pull/1051 Only generate execution stubs for the top-level executables
            if (file.endsWith(".exe") && !file.includes("squirrel.exe") && !relativeSafeFilePath.includes("/")) {
                const tempFile = await packager.getTempFile("stub.exe");
                await (0, fs_1.copyFile)(path.join(vendorPath, "StubExecutable.exe"), tempFile);
                await (0, wine_1.execWine)(path.join(vendorPath, "WriteZipToSetup.exe"), null, ["--copy-stub-resources", file, tempFile]);
                await packager.sign(tempFile);
                archive._append(tempFile, {
                    name: relativeSafeFilePath.substring(0, relativeSafeFilePath.length - 4) + "_ExecutionStub.exe",
                    prefix,
                    stats: await (0, fs_extra_1.stat)(tempFile),
                });
            }
        },
    });
    archive.finalize();
}
//# sourceMappingURL=squirrelPack.js.map