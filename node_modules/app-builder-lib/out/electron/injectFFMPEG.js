"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const builder_util_1 = require("builder-util");
const binDownload_1 = require("../binDownload");
// NOTE: Adapted from https://github.com/MarshallOfSound/electron-packager-plugin-non-proprietary-codecs-ffmpeg to resolve dependency vulnerabilities
const downloadFFMPEG = async (electronVersion, platform, arch) => {
    const ffmpegFileName = `ffmpeg-v${electronVersion}-${platform}-${arch}.zip`;
    const url = `https://github.com/electron/electron/releases/download/v${electronVersion}/${ffmpegFileName}`;
    builder_util_1.log.info({ file: ffmpegFileName }, "downloading non-proprietary FFMPEG");
    return (0, binDownload_1.getBin)(ffmpegFileName, url);
};
const copyFFMPEG = (targetPath, platform) => (sourcePath) => {
    let fileName = "ffmpeg.dll";
    if (["darwin", "mas"].includes(platform)) {
        fileName = "libffmpeg.dylib";
    }
    else if (platform === "linux") {
        fileName = "libffmpeg.so";
    }
    const libPath = path.resolve(sourcePath, fileName);
    const libTargetPath = path.resolve(targetPath, fileName);
    builder_util_1.log.info({ lib: libPath, target: libTargetPath }, "copying non-proprietary FFMPEG");
    // If the source doesn't exist we have a problem
    if (!fs.existsSync(libPath)) {
        throw new Error(`Failed to find FFMPEG library file at path: ${libPath}`);
    }
    // If we are copying to the source we can stop immediately
    if (libPath !== libTargetPath) {
        fs.copyFileSync(libPath, libTargetPath);
    }
    return libTargetPath;
};
function injectFFMPEG(options, electrionVersion) {
    let libPath = options.appOutDir;
    if (options.platformName === "darwin") {
        libPath = path.resolve(options.appOutDir, "Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries");
    }
    return downloadFFMPEG(electrionVersion, options.platformName, options.arch).then(copyFFMPEG(libPath, options.platformName));
}
exports.default = injectFFMPEG;
//# sourceMappingURL=injectFFMPEG.js.map