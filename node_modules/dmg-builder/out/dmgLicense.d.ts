import { PlatformPackager } from "app-builder-lib";
type LicenseConfig = {
    $schema: string;
    body: any[];
    labels: any[];
};
export declare function addLicenseToDmg(packager: PlatformPackager<any>, dmgPath: string): Promise<LicenseConfig | null>;
export {};
