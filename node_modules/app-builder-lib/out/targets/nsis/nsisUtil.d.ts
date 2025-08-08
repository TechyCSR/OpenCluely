import { Arch } from "builder-util";
import { PackageFileInfo } from "builder-util-runtime";
import { NsisTarget } from "./NsisTarget";
import { NsisOptions } from "./nsisOptions";
export declare const nsisTemplatesDir: string;
export declare const NsisTargetOptions: {
    then: (callback: (options: NsisOptions) => any) => Promise<string>;
    resolve: (options: NsisOptions) => any;
};
export declare const NSIS_PATH: () => Promise<string>;
export interface PackArchResult {
    fileInfo: PackageFileInfo;
    unpackedSize: number;
}
export declare class AppPackageHelper {
    private readonly elevateHelper;
    private readonly archToResult;
    private readonly infoToIsDelete;
    /** @private */
    refCount: number;
    constructor(elevateHelper: CopyElevateHelper);
    packArch(arch: Arch, target: NsisTarget): Promise<PackArchResult>;
    finishBuild(): Promise<any>;
}
export declare class CopyElevateHelper {
    private readonly copied;
    copy(appOutDir: string, target: NsisTarget): Promise<any>;
}
export declare class UninstallerReader {
    static exec(installerPath: string, uninstallerPath: string): Promise<void>;
}
