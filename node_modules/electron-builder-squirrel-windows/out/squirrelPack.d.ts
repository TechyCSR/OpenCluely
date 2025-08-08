import { Arch } from "builder-util";
import { WinPackager } from "app-builder-lib/out/winPackager";
export declare function convertVersion(version: string): string;
export interface SquirrelOptions {
    vendorPath: string;
    remoteReleases?: string;
    remoteToken?: string;
    loadingGif?: string;
    productName: string;
    appId?: string;
    name: string;
    packageCompressionLevel?: number;
    version: string;
    msi?: any;
    description?: string;
    iconUrl?: string;
    authors?: string;
    extraMetadataSpecs?: string;
    copyright?: string;
}
export interface OutFileNames {
    setupFile: string;
    packageFile: string;
}
export declare class SquirrelBuilder {
    private readonly options;
    private readonly outputDirectory;
    private readonly packager;
    constructor(options: SquirrelOptions, outputDirectory: string, packager: WinPackager);
    buildInstaller(outFileNames: OutFileNames, appOutDir: string, outDir: string, arch: Arch): Promise<void>;
    private releasify;
    private createEmbeddedArchiveFile;
}
