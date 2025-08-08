import TransportStream = require("winston-transport");

// referenced from https://stackoverflow.com/questions/40510611/typescript-interface-require-one-of-two-properties-to-exist
type RequireOnlyOne<T, Keys extends keyof T = keyof T> =
    Pick<T, Exclude<keyof T, Keys>>
    & {
        [K in Keys]-?:
            Pick<T, K>
            & Partial<Record<Exclude<Keys, K>, undefined>>
    }[Keys];

// merging into winston.transports
declare module 'winston/lib/winston/transports' {
    interface Transports {
        DailyRotateFile: typeof DailyRotateFile;
        DailyRotateFileTransportOptions: DailyRotateFile.DailyRotateFileTransportOptions;
    }
}

declare namespace DailyRotateFile {
    type DailyRotateFileTransportOptions = RequireOnlyOne<GeneralDailyRotateFileTransportOptions, 'filename' | 'stream'>;

    interface GeneralDailyRotateFileTransportOptions extends TransportStream.TransportStreamOptions {
        json?: boolean;
        eol?: string;

        /**
         * A string representing the moment.js date format to be used for rotating. The meta characters used in this string will dictate the frequency of the file rotation. For example, if your datePattern is simply 'HH' you will end up with 24 log files that are picked up and appended to every day. (default 'YYYY-MM-DD')
         */
        datePattern?: string;

        /**
         * A boolean to define whether or not to gzip archived log files. (default 'false')
         */
        zippedArchive?: boolean;

        /**
         * Filename to be used to log to. This filename can include the %DATE% placeholder which will include the formatted datePattern at that point in the filename. (default: 'winston.log.%DATE%)
         */
        filename?: string;

        /**
         * The directory name to save log files to. (default: '.')
         */
        dirname?: string;

        /**
         * Write directly to a custom stream and bypass the rotation capabilities. (default: null)
         */
        stream?: NodeJS.WritableStream;

        /**
         * Maximum size of the file after which it will rotate. This can be a number of bytes, or units of kb, mb, and gb. If using the units, add 'k', 'm', or 'g' as the suffix. The units need to directly follow the number. (default: null)
         */
        maxSize?: string | number;

        /**
         * Maximum number of logs to keep. If not set, no logs will be removed. This can be a number of files or number of days. If using days, add 'd' as the suffix. (default: null)
         */
        maxFiles?: string | number;

        /**
         * An object resembling https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options indicating additional options that should be passed to the file stream. (default: `{ flags: 'a' }`)
         */
        options?: string | object;

        /**
         * A string representing the name of the name of the audit file. (default: './hash-audit.json')
         */
        auditFile?: string;

        /**
         * A string representing the frequency of rotation. (default: 'custom')
         */
        frequency?: string;

        /**
         * A boolean whether or not to generate file name from "datePattern" in UTC format. (default: false)
         */
        utc?: boolean;

        /**
         * A string representing an extension to be added to the filename, if not included in the filename property. (default: '')
         */
        extension?: string;

        /**
         * Create a tailable symlink to the current active log file. (default: false)
         */
        createSymlink?: boolean;

        /**
         * The name of the tailable symlink. (default: 'current.log')
         */
        symlinkName?: string;

        /**
         * Watch the current file being written to and recreate it in case of accidental deletion. (default: FALSE)
         */
        watchLog?: boolean;
        
        handleRejections?: boolean;

        /**
         * Use specified hashing algorithm for audit. (default: 'sha256')
         */
        auditHashType?: string;
    }
}

declare class DailyRotateFile extends TransportStream {
    filename: string;
    dirname: string;
    logStream: NodeJS.WritableStream;
    options: DailyRotateFile.DailyRotateFileTransportOptions;

    constructor(options?: DailyRotateFile.DailyRotateFileTransportOptions);
}

export = DailyRotateFile;
