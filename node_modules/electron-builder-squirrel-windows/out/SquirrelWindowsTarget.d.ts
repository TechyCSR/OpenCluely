import { Arch, SquirrelWindowsOptions, Target } from "app-builder-lib";
import { WinPackager } from "app-builder-lib/out/winPackager";
import { SquirrelOptions } from "./squirrelPack";
export default class SquirrelWindowsTarget extends Target {
    private readonly packager;
    readonly outDir: string;
    readonly options: SquirrelWindowsOptions;
    constructor(packager: WinPackager, outDir: string);
    build(appOutDir: string, arch: Arch): Promise<void>;
    private get appName();
    computeEffectiveDistOptions(): Promise<SquirrelOptions>;
}
