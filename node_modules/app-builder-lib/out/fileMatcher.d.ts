import { PlatformSpecificBuildOptions } from "./index";
export declare const excludedNames: string;
export declare const excludedExts: string;
export interface GetFileMatchersOptions {
    readonly macroExpander: (pattern: string) => string;
    readonly customBuildOptions: PlatformSpecificBuildOptions;
    readonly globalOutDir: string;
    readonly defaultSrc: string;
}
