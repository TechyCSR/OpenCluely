'use strict';

/*!
 * FileStreamRotator
 * Copyright(c) 2012-2017 Holiday Extras.
 * Copyright(c) 2017 Roger C.
 * MIT Licensed
 */

/**
 * Module dependencies.
 */
var fs = require('fs');
var path = require('path');
var moment = require('moment');
var crypto = require('crypto');

var EventEmitter = require('events');

/**
 * FileStreamRotator:
 *
 * Returns a file stream that auto-rotates based on date.
 *
 * Options:
 *
 *   - `filename`       Filename including full path used by the stream
 *
 *   - `frequency`      How often to rotate. Options are 'daily', 'custom' and 'test'. 'test' rotates every minute.
 *                      If frequency is set to none of the above, a YYYYMMDD string will be added to the end of the filename.
 *
 *   - `verbose`        If set, it will log to STDOUT when it rotates files and name of log file. Default is TRUE.
 *
 *   - `date_format`    Format as used in moment.js http://momentjs.com/docs/#/displaying/format/. The result is used to replace
 *                      the '%DATE%' placeholder in the filename.
 *                      If using 'custom' frequency, it is used to trigger file change when the string representation changes.
 *
 *   - `size`           Max size of the file after which it will rotate. It can be combined with frequency or date format.
 *                      The size units are 'k', 'm' and 'g'. Units need to directly follow a number e.g. 1g, 100m, 20k.
 *
 *   - `max_logs`       Max number of logs to keep. If not set, it won't remove past logs. It uses its own log audit file
 *                      to keep track of the log files in a json format. It won't delete any file not contained in it.
 *                      It can be a number of files or number of days. If using days, add 'd' as the suffix.
 *
 *   - `audit_file`     Location to store the log audit file. If not set, it will be stored in the root of the application.
 * 
 *   - `end_stream`     End stream (true) instead of the default behaviour of destroy (false). Set value to true if when writing to the
 *                      stream in a loop, if the application terminates or log rotates, data pending to be flushed might be lost.                    
 *
 *   - `file_options`   An object passed to the stream. This can be used to specify flags, encoding, and mode.
 *                      See https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options. Default `{ flags: 'a' }`.
 * 
 *   - `utc`            Use UTC time for date in filename. Defaults to 'FALSE'
 * 
 *   - `extension`      File extension to be appended to the filename. This is useful when using size restrictions as the rotation
 *                      adds a count (1,2,3,4,...) at the end of the filename when the required size is met.
 * 
 *   - `watch_log`      Watch the current file being written to and recreate it in case of accidental deletion. Defaults to 'FALSE'
 *
 *   - `create_symlink` Create a tailable symlink to the current active log file. Defaults to 'FALSE'
 * 
 *   - `symlink_name`   Name to use when creating the symbolic link. Defaults to 'current.log'
 * 
 *   - `audit_hash_type` Use specified hashing algorithm for audit. Defaults to 'md5'. Use 'sha256' for FIPS compliance.
 *
 * To use with Express / Connect, use as below.
 *
 * var rotatingLogStream = require('FileStreamRotator').getStream({filename:"/tmp/test.log", frequency:"daily", verbose: false})
 * app.use(express.logger({stream: rotatingLogStream, format: "default"}));
 *
 * @param {Object} options
 * @return {Object}
 * @api public
 */
var FileStreamRotator = {};

module.exports = FileStreamRotator;

var staticFrequency = ['daily', 'test', 'm', 'h', 'custom'];
var DATE_FORMAT = ('YYYYMMDDHHmm');


/**
 * Returns frequency metadata for minute/hour rotation
 * @param type
 * @param num
 * @returns {*}
 * @private
 */
var _checkNumAndType = function (type, num) {
    if (typeof num == 'number') {
        switch (type) {
            case 'm':
                if (num < 0 || num > 60) {
                    return false;
                }
                break;
            case 'h':
                if (num < 0 || num > 24) {
                    return false;
                }
                break;
        }
        return {type: type, digit: num};
    }
}

/**
 * Returns frequency metadata for defined frequency
 * @param freqType
 * @returns {*}
 * @private
 */
var _checkDailyAndTest = function (freqType) {
    switch (freqType) {
        case 'custom':
        case 'daily':
            return {type: freqType, digit: undefined};
            break;
        case 'test':
            return {type: freqType, digit: 0};
    }
    return false;
}


/**
 * Returns frequency metadata
 * @param frequency
 * @returns {*}
 */
FileStreamRotator.getFrequency = function (frequency) {
    var _f = frequency.toLowerCase().match(/^(\d+)([mh])$/)
    if(_f){
        return _checkNumAndType(_f[2], parseInt(_f[1]));
    }

    var dailyOrTest = _checkDailyAndTest(frequency);
    if (dailyOrTest) {
        return dailyOrTest;
    }

    return false;
}

/**
 * Returns a number based on the option string
 * @param size
 * @returns {Number}
 */
FileStreamRotator.parseFileSize = function (size) {
    if(size && typeof size == "string"){
        var _s = size.toLowerCase().match(/^((?:0\.)?\d+)([kmg])$/);
        if(_s){
            switch(_s[2]){
                case 'k':
                    return _s[1]*1024
                case 'm':
                    return _s[1]*1024*1024
                case 'g':
                    return _s[1]*1024*1024*1024
            }
        }
    }
    return null;
};

/**
 * Returns date string for a given format / date_format
 * @param format
 * @param date_format
 * @param {boolean} utc
 * @returns {string}
 */
FileStreamRotator.getDate = function (format, date_format, utc) {
    date_format = date_format || DATE_FORMAT;
    let currentMoment = utc ? moment.utc() : moment().local()
    if (format && staticFrequency.indexOf(format.type) !== -1) {
        switch (format.type) {
            case 'm':
                var minute = Math.floor(currentMoment.minutes() / format.digit) * format.digit;
                return currentMoment.minutes(minute).format(date_format);
                break;
            case 'h':
                var hour = Math.floor(currentMoment.hour() / format.digit) * format.digit;
                return currentMoment.hour(hour).format(date_format);
                break;
            case 'daily':
            case 'custom':
            case 'test':
                return currentMoment.format(date_format);
        }
    }
    return currentMoment.format(date_format);
}

/**
 * Read audit json object from disk or return new object or null
 * @param max_logs
 * @param audit_file
 * @param log_file
 * @returns {Object} auditLogSettings
 * @property {Object} auditLogSettings.keep
 * @property {Boolean} auditLogSettings.keep.days
 * @property {Number} auditLogSettings.keep.amount
 * @property {String} auditLogSettings.auditLog
 * @property {Array} auditLogSettings.files
 * @property {String} auditLogSettings.hashType
 */
FileStreamRotator.setAuditLog = function (max_logs, audit_file, log_file){
    var _rtn = null;
    if(max_logs){
        var use_days = max_logs.toString().substr(-1);
        var _num = max_logs.toString().match(/^(\d+)/);

        if(Number(_num[1]) > 0) {
            var baseLog = path.dirname(log_file.replace(/%DATE%.+/,"_filename"));
            try{
                if(audit_file){
                    var full_path = path.resolve(audit_file);
                    _rtn = JSON.parse(fs.readFileSync(full_path, { encoding: 'utf-8' }));
                }else{
                    var full_path = path.resolve(baseLog + "/" + ".audit.json")
                    _rtn = JSON.parse(fs.readFileSync(full_path, { encoding: 'utf-8' }));
                }
            }catch(e){
                if(e.code !== "ENOENT"){
                    return null;
                }
                _rtn = {
                    keep: {
                        days: false,
                        amount: Number(_num[1])
                    },
                    auditLog: audit_file || baseLog + "/" + ".audit.json",
                    files: []
                };
            }

            _rtn.keep = {
                days: use_days === 'd',
                amount: Number(_num[1])
            };

        }
    }
    return _rtn;
};

/**
 * Write audit json object to disk
 * @param {Object} audit
 * @param {Object} audit.keep
 * @param {Boolean} audit.keep.days
 * @param {Number} audit.keep.amount
 * @param {String} audit.auditLog
 * @param {Array} audit.files
 * @param {String} audit.hashType
 * @param {Boolean} verbose 
 */
FileStreamRotator.writeAuditLog = function(audit, verbose){
    try{
        mkDirForFile(audit.auditLog);
        fs.writeFileSync(audit.auditLog, JSON.stringify(audit,null,4));
    }catch(e){
        if (verbose) {
            console.error(new Date(),"[FileStreamRotator] Failed to store log audit at:", audit.auditLog,"Error:", e);
        }
    }
};


/**
 * Removes old log file
 * @param file
 * @param file.hash
 * @param file.name
 * @param file.date
 * @param file.hashType
 * @param {Boolean} verbose 
 */
function removeFile(file, verbose){
    if(file.hash === crypto.createHash(file.hashType).update(file.name + "LOG_FILE" + file.date).digest("hex")){
        try{
            if (fs.existsSync(file.name)) {
                fs.unlinkSync(file.name);
            }
        }catch(e){
            if (verbose) {
                console.error(new Date(), "[FileStreamRotator] Could not remove old log file: ", file.name);
            }
        }
    }
}

/**
 * Create symbolic link to current log file
 * @param {String} logfile 
 * @param {String} name Name to use for symbolic link 
 * @param {Boolean} verbose 
 */
function createCurrentSymLink(logfile, name, verbose) {
    let symLinkName = name || "current.log"
    let logPath = path.dirname(logfile)
    let logfileName = path.basename(logfile)
    let current = logPath + "/" + symLinkName
    try {
        let stats = fs.lstatSync(current)
        if(stats.isSymbolicLink()){
            fs.unlinkSync(current)
            fs.symlinkSync(logfileName, current)
        }
    } catch (err) {
        if(err && err.code == "ENOENT") {
            try {
                fs.symlinkSync(logfileName, current)
            } catch (e) {
                if (verbose) {
                    console.error(new Date(), "[FileStreamRotator] Could not create symlink file: ", current, ' -> ', logfileName);
                }
            }
        }
    }
}

/**
 * 
 * @param {String} logfile 
 * @param {Boolean} verbose 
 * @param {function} cb 
 */
function createLogWatcher(logfile, verbose, cb){
    if(!logfile) return null
    // console.log("Creating log watcher")
    try {
        let stats = fs.lstatSync(logfile)
        return fs.watch(logfile, function(event,filename){
            // console.log(Date(), event, filename)
            if(event == "rename"){
                try {
                    let stats = fs.lstatSync(logfile)
                    // console.log("STATS:", stats)
                }catch(err){
                    // console.log("ERROR:", err)
                    cb(err,logfile)
                }                    
            }
        })
    }catch(err){
        if(verbose){
            console.log(new Date(),"[FileStreamRotator] Could not add watcher for " + logfile);
        }
    }                    
}

/**
 * Write audit json object to disk
 * @param {String} logfile
 * @param {Object} audit
 * @param {Object} audit.keep
 * @param {Boolean} audit.keep.days
 * @param {Number} audit.keep.amount
 * @param {String} audit.auditLog
 * @param {String} audit.hashType
 * @param {Array} audit.files
 * @param {EventEmitter} stream
 * @param {Boolean} verbose 
 */
FileStreamRotator.addLogToAudit = function(logfile, audit, stream, verbose){
    if(audit && audit.files){
        // Based on contribution by @nickbug - https://github.com/nickbug
        var index = audit.files.findIndex(function(file) {
            return (file.name === logfile);
        });
        if (index !== -1) {
            // nothing to do as entry already exists.
            return audit;
        }
        var time = Date.now();
        audit.files.push({
            date: time,
            name: logfile,
            hash: crypto.createHash(audit.hashType).update(logfile + "LOG_FILE" + time).digest("hex")
        });

        if(audit.keep.days){
            var oldestDate = moment().subtract(audit.keep.amount,"days").valueOf();
            var recentFiles = audit.files.filter(function(file){
                if(file.date > oldestDate){
                    return true;
                }
                file.hashType = audit.hashType
                removeFile(file, verbose);
                stream.emit("logRemoved", file)
                return false;
            });
            audit.files = recentFiles;
        }else{
            var filesToKeep = audit.files.splice(-audit.keep.amount);
            if(audit.files.length > 0){
                audit.files.filter(function(file){
                    file.hashType = audit.hashType
                    removeFile(file, verbose);
                    stream.emit("logRemoved", file)
                    return false;
                })
            }
            audit.files = filesToKeep;
        }

        FileStreamRotator.writeAuditLog(audit, verbose);
    }

    return audit;
}

/**
 *
 * @param options
 * @param options.filename
 * @param options.frequency
 * @param options.verbose
 * @param options.date_format
 * @param options.size
 * @param options.max_logs
 * @param options.audit_file
 * @param options.file_options
 * @param options.utc
 * @param options.extension File extension to be added at the end of the filename
 * @param options.watch_log
 * @param options.create_symlink
 * @param options.symlink_name
 * @param options.audit_hash_type Hash to be used to add to the audit log (md5, sha256)
 * @returns {Object} stream
 */
FileStreamRotator.getStream = function (options) {
    var frequencyMetaData = null;
    var curDate = null;
    var self = this;

    if (!options.filename) {
        console.error(new Date(),"[FileStreamRotator] No filename supplied. Defaulting to STDOUT");
        return process.stdout;
    }

    if (options.frequency) {
        frequencyMetaData = self.getFrequency(options.frequency);
    }

    let auditLog = self.setAuditLog(options.max_logs, options.audit_file, options.filename);
    // Thanks to Means88 for PR.
    if (auditLog != null) {
        auditLog.hashType = (options.audit_hash_type !== undefined ? options.audit_hash_type : 'md5');
    }
    self.verbose = (options.verbose !== undefined ? options.verbose : true);

    var fileSize = null;
    var fileCount = 0;
    var curSize = 0;
    if(options.size){
        fileSize = FileStreamRotator.parseFileSize(options.size);
    }

    var dateFormat = (options.date_format || DATE_FORMAT);
    if(frequencyMetaData && frequencyMetaData.type == "daily"){
        if(!options.date_format){
            dateFormat = "YYYY-MM-DD";
        }
        if(moment().format(dateFormat) != moment().endOf("day").format(dateFormat) || moment().format(dateFormat) == moment().add(1,"day").format(dateFormat)){
            if(self.verbose){
                console.log(new Date(),"[FileStreamRotator] Changing type to custom as date format changes more often than once a day or not every day");
            }
            frequencyMetaData.type = "custom";
        }
    }

    if (frequencyMetaData) {
        curDate = (options.frequency ? self.getDate(frequencyMetaData,dateFormat, options.utc) : "");
    }

    options.create_symlink = options.create_symlink || false;
    options.extension = options.extension || ""
    var filename = options.filename;
    var oldFile = null;
    var logfile = filename + (curDate ? "." + curDate : "");
    if(filename.match(/%DATE%/)){
        logfile = filename.replace(/%DATE%/g,(curDate?curDate:self.getDate(null,dateFormat, options.utc)));
    }

    if(fileSize){
        var lastLogFile = null;
        var t_log = logfile;
        var f = null;
        if(auditLog && auditLog.files && auditLog.files instanceof Array && auditLog.files.length > 0){
            var lastEntry = auditLog.files[auditLog.files.length - 1].name;
            if(lastEntry.match(t_log)){
                var lastCount = lastEntry.match(t_log + "\\.(\\d+)");
                // Thanks for the PR contribution from @andrefarzat - https://github.com/andrefarzat
                if(lastCount){                    
                    t_log = lastEntry;
                    fileCount = lastCount[1];
                }
            }
        }

        if (fileCount == 0 && t_log == logfile) {
            t_log += options.extension
        }

        while(f = fs.existsSync(t_log)){
            lastLogFile = t_log;
            fileCount++;
            t_log = logfile + "." + fileCount + options.extension;
        }
        if(lastLogFile){
            var lastLogFileStats = fs.statSync(lastLogFile);
            if(lastLogFileStats.size < fileSize){
                t_log = lastLogFile;
                fileCount--;
                curSize = lastLogFileStats.size;
            }
        }
        logfile = t_log;
    } else {
        logfile += options.extension
    }

    if (self.verbose) {
        console.log(new Date(),"[FileStreamRotator] Logging to: ", logfile);
    }

    mkDirForFile(logfile);

    var file_options = options.file_options || {flags: 'a'};
    var rotateStream = fs.createWriteStream(logfile, file_options);
    if ((curDate && frequencyMetaData && (staticFrequency.indexOf(frequencyMetaData.type) > -1)) || fileSize > 0) {
        if (self.verbose) {
            console.log(new Date(),"[FileStreamRotator] Rotating file: ", frequencyMetaData?frequencyMetaData.type:"", fileSize?"size: " + fileSize:"");
        }
        var stream = new EventEmitter();
        stream.auditLog = auditLog;
        stream.end = function(){
            rotateStream.end.apply(rotateStream,arguments);
        };
        BubbleEvents(rotateStream,stream);

        stream.on('close', function(){
            if (logWatcher) {
                logWatcher.close()
            }
        })

        stream.on("new",function(newLog){
            // console.log("new log", newLog)
            stream.auditLog = self.addLogToAudit(newLog,stream.auditLog, stream, self.verbose)
            if(options.create_symlink){
                createCurrentSymLink(newLog, options.symlink_name, self.verbose)
            }
            if(options.watch_log){
                stream.emit("addWatcher", newLog)
            }
        });
        
        var logWatcher;
        stream.on("addWatcher", function(newLog){
            if (logWatcher) {
                logWatcher.close()
            }
            if(!options.watch_log){
                return
            }
            // console.log("ADDING WATCHER", newLog)
            logWatcher = createLogWatcher(newLog, self.verbose, function(err,newLog){
                stream.emit('createLog', newLog)
            })        
        })

        stream.on("createLog",function(file){
            try {
                let stats = fs.lstatSync(file)
            }catch(err){
                if(rotateStream && rotateStream.end == "function"){
                    rotateStream.end();
                }
                rotateStream = fs.createWriteStream(file, file_options);
                stream.emit('new',file);
                BubbleEvents(rotateStream,stream);
            }
        });


        stream.write = (function (str, encoding) {
            var newDate = frequencyMetaData ? this.getDate(frequencyMetaData, dateFormat, options.utc) : curDate;
            if (newDate != curDate || (fileSize && curSize > fileSize)) {
                var newLogfile = filename + (curDate && frequencyMetaData ? "." + newDate : "");
                if(filename.match(/%DATE%/) && curDate){
                    newLogfile = filename.replace(/%DATE%/g,newDate);
                }

                if(fileSize && curSize > fileSize){
                    fileCount++;
                    newLogfile += "." + fileCount + options.extension;
                }else{
                    // reset file count
                    fileCount = 0;
                    newLogfile += options.extension
                }
                curSize = 0;

                if (self.verbose) {
                    console.log(new Date(),require('util').format("[FileStreamRotator] Changing logs from %s to %s", logfile, newLogfile));
                }
                curDate = newDate;
                oldFile = logfile;
                logfile = newLogfile;
                // Thanks to @mattberther https://github.com/mattberther for raising it again.
                if(options.end_stream === true){
                    rotateStream.end();
                }else{
                    rotateStream.destroy();
                }

                mkDirForFile(logfile);

                rotateStream = fs.createWriteStream(newLogfile, file_options);
                stream.emit('new',newLogfile);
                stream.emit('rotate',oldFile, newLogfile);
                BubbleEvents(rotateStream,stream);
            }
            rotateStream.write(str, encoding);
            // Handle length of double-byte characters
            curSize += Buffer.byteLength(str, encoding);
        }).bind(this);
        process.nextTick(function(){
            stream.emit('new',logfile);
        })
        stream.emit('new',logfile)
        return stream;
    } else {
        if (self.verbose) {
            console.log(new Date(),"[FileStreamRotator] File won't be rotated: ", options.frequency, options.size);
        }
        process.nextTick(function(){
            rotateStream.emit('new',logfile);
        })
        return rotateStream;
    }
}

/**
 * Check and make parent directory
 * @param pathWithFile
 */
var mkDirForFile = function(pathWithFile){
    var _path = path.dirname(pathWithFile);
    _path.split(path.sep).reduce(
        function(fullPath, folder) {
            fullPath += folder + path.sep;
            // Option to replace existsSync as deprecated. Maybe in a future release.
            // try{
            //     var stats = fs.statSync(fullPath);
            //     console.log('STATS',fullPath, stats);
            // }catch(e){
            //     fs.mkdirSync(fullPath);
            //     console.log("STATS ERROR",e)
            // }
            if (!fs.existsSync(fullPath)) {
                try{
                    fs.mkdirSync(fullPath);
                }catch(e){
                    if(e.code !== 'EEXIST'){
                        throw e;
                    }
                }
            }
            return fullPath;
        },
        ''
    );
};


/**
 * Bubbles events to the proxy
 * @param emitter
 * @param proxy
 * @constructor
 */
var BubbleEvents = function BubbleEvents(emitter,proxy){
    emitter.on('close',function(){
        proxy.emit('close');
    })
    emitter.on('finish',function(){
        proxy.emit('finish');
    })
    emitter.on('error',function(err){
        proxy.emit('error',err);
    })
    emitter.on('open',function(fd){
        proxy.emit('open',fd);
    })
}
