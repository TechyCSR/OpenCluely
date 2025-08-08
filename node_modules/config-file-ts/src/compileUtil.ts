import { glob } from "glob";
import path from "path";
import { tsCompile } from "./tsCompile";
import ts from "typescript";
import fs from "fs";

const fsRoot = path.parse(process.cwd()).root;

/** Return true if any files need compiling */
export function needsCompile(srcGlobs: string[], outDir: string): boolean {
  const files = srcGlobs.flatMap((src) => glob.sync(src));
  const srcDestPairs = compilationPairs(files, outDir);
  return anyOutDated(srcDestPairs);
}

/** Return true if all files exist on the filesystem */
export function expectFilesExist(files: string[]): boolean {
  const missing = files.find((file) => !fs.existsSync(file));
  if (missing) {
    return false;
  }
  return true;
}

/** @return path to the js file that will be produced by typescript compilation */
export function jsOutFile(tsFile: string, outDir: string): string {
  const tsAbsolutePath = path.resolve(tsFile);
  const tsAbsoluteDir = path.dirname(tsAbsolutePath);
  const dirFromRoot = path.relative(fsRoot, tsAbsoluteDir);
  const jsDir = path.join(outDir, dirFromRoot);
  const outFile = changeSuffix(path.basename(tsFile), ".js");
  return path.join(jsDir, outFile);
}

/* 
We set rootDir to fsRoot for tsc compilation.

That means that the .js output files produced by typescript will be in a deep tree
of subdirectories mirroring the path from / to the source file.  
  e.g. /home/lee/proj/foo.ts will output to outdir/home/proj/lee/foo.js.

We need to set a rootDir so that the output tree js files produced by typescript is
predictable prior to compilation. Without a rootDir, tsc will make an output tree that
is as short as possible depending on the imports used by the .ts files. Shorter is nice, 
but the unpredictability breaks checks for on-demand compilation.

A .ts file can import from parent directories.
  e.g. import * from "../util". 
So we use the file system root as the rootDir to be conservative in handling
potential parent directory imports.
*/

export function compileIfNecessary(
  sources: string[],
  outDir: string,
  strict = true
): boolean {
  const sourceSet = new Set([...sources, ...extendedSources(outDir)]);
  const allSources = [...sourceSet];
  if (needsCompile(allSources, outDir)) {
    const { compiled, localSources } = tsCompile(sources, {
      outDir,
      rootDir: fsRoot,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      skipLibCheck: true,
      strict,
      target: ts.ScriptTarget.ES2019,
      noImplicitAny: false,
      noEmitOnError: true,
    });
    if (compiled) {
      saveExtendedSources(outDir, localSources);
      linkNodeModules(outDir);
    }
    return compiled;
  }
  return true;
}

/** local sources used in last compilation, including imports */
function extendedSources(outDir: string): string[] {
  const file = sourcesFile(outDir);
  if (!fs.existsSync(file)) {
    return [];
  }
  const lines = fs.readFileSync(file, "utf8");
  return lines.split("\n");
}

function sourcesFile(outDir: string): string {
  return path.join(outDir, "_sources");
}

function saveExtendedSources(outDir: string, allSources: string[]): void {
  const file = sourcesFile(outDir);
  fs.writeFileSync(file, allSources.join("\n"));
}

/** Put a link in the output directory to node_modules.
 */
function linkNodeModules(outDir: string): void {
  /*
   * Note that this only puts a link to the single node_modules directory
   * that's closest by.
   *
   * But I think node's module resolution will search multiple
   * parent directories for multiple node_modules at runtime. So just one
   * node_modules link may be insufficient in some complicated cases.
   *
   * If supporting the more complicated case is worthwhile, we can consider
   * e.g. encoding a full list of node_modules and setting NODE_PATH instead
   * of the symlink approach here.
   */
  const nodeModules = nearestNodeModules(process.cwd());
  if (nodeModules) {
    const linkToModules = path.join(outDir, "node_modules");
    symLinkForce(nodeModules, linkToModules);
  }
}

/** create a symlink, replacing any existing linkfile */
export function symLinkForce(existing: string, link: string): void {
  if (fs.existsSync(link)) {
    if (!fs.lstatSync(link).isSymbolicLink()) {
      throw `symLinkForce refusing to unlink non-symlink ${link}`;
    }
    fs.unlinkSync(link);
  }
  fs.symlinkSync(existing, link);
}

/** @return the resolved path to the nearest node_modules file,
 * either in the provided directory or a parent.
 */
export function nearestNodeModules(dir: string): string | undefined {
  const resolvedDir = path.resolve(dir);
  const modulesFile = path.join(resolvedDir, "node_modules");

  if (fs.existsSync(modulesFile)) {
    return modulesFile;
  } else {
    const { dir: parent, root } = path.parse(resolvedDir);
    if (parent !== root) {
      return nearestNodeModules(parent);
    } else {
      return undefined;
    }
  }
}

/**
 * Compile a typescript config file to js if necessary (if the js
 * file doesn't exist or is older than the typescript file).
 *
 * @param tsFile path to ts config file
 * @param outDir directory to place the compiled js file
 * @returns the path to the compiled javascript config file,
 *   or undefined if the compilation fails.
 */
export function compileConfigIfNecessary(
  tsFile: string,
  outDir: string,
  strict = true
): string | undefined {
  if (!fs.existsSync(tsFile)) {
    console.error("config file:", tsFile, " not found");
    return undefined;
  }

  const success = compileIfNecessary([tsFile], outDir, strict);
  if (!success) {
    return undefined;
  }

  return jsOutFile(tsFile, outDir);
}

function compilationPairs(
  srcFiles: string[],
  outDir: string
): [string, string][] {
  return srcFiles.map((tsFile) => {
    return [tsFile, jsOutFile(tsFile, outDir)];
  });
}

function anyOutDated(filePairs: [string, string][]): boolean {
  const found = filePairs.find(([srcPath, outPath]) => {
    if (!fs.existsSync(outPath)) {
      return true;
    }
    const srcTime = fs.statSync(srcPath).mtime;
    const outTime = fs.statSync(outPath).mtime;
    return srcTime > outTime;
  });

  return found !== undefined;
}

function changeSuffix(filePath: string, suffix: string): string {
  const dir = path.dirname(filePath);
  const curSuffix = path.extname(filePath);
  const base = path.basename(filePath, curSuffix);
  return path.join(dir, base + suffix);
}
