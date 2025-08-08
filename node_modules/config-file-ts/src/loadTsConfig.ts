import { compileConfigIfNecessary } from "./compileUtil";
import os, { platform } from "os";
import path from "path";

/** Load a typescript configuration file.
 * For speed, the typescript file is transpiled to javascript and cached.
 *
 * @param T type of default export value in the configuration file
 * @param outDir location to store the compiled javascript.
 * @returns the default exported value from the configuration file or undefined
 */
export function loadTsConfig<T>(
  tsFile: string,
  outDir?: string,
  strict = true
): T | undefined {
  const realOutDir = outDir || defaultOutDir(tsFile, "config-file-ts");
  const jsConfig = compileConfigIfNecessary(tsFile, realOutDir, strict);
  if (!jsConfig) {
    return undefined;
  }

  const end = jsConfig.length - path.extname(jsConfig).length;
  const requirePath = jsConfig.slice(0, end);
  const config = require(requirePath);
  return config.default;
}

/** @return the directory that will be used to store transpilation output. */
export function defaultOutDir(
  tsFile: string,
  programName: string = ""
): string {
  const tsPath = path.resolve(tsFile);
  let smushedPath = tsPath
    .split(path.sep)
    .join("-")
    .slice(1);
  if (platform.name === "win32") {
    smushedPath = smushedPath.replace(/^:/, "");
  }
  return path.join(os.homedir(), ".cache", programName, smushedPath);
}
