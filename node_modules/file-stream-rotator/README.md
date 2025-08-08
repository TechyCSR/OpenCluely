
file-stream-rotator
===================

NodeJS file stream rotator

## Purpose

To provide an automated rotation of Express/Connect logs or anything else that writes to a file on a regular basis that needs to be rotated based on date, a size limit or combination and remove old log files based on count or elapsed days. 

## Install

```
npm install file-stream-rotator
```

## Options

 - *filename*:       Filename including full path used by the stream
 - *frequency*:      How often to rotate. Options are 'daily', 'custom' and 'test'. 'test' rotates every minute.
                     If frequency is set to none of the above, a YYYYMMDD string will be added to the end of the filename.
 - *verbose*:        If set, it will log to STDOUT when it rotates files and name of log file. Default is TRUE.
 - *date_format*:    Format as used in moment.js http://momentjs.com/docs/#/displaying/format/. The result is used to replace
                     the '%DATE%' placeholder in the filename.
                     If using 'custom' frequency, it is used to trigger file rotation when the string representation changes.
 - *size*:           Max size of the file after which it will rotate. It can be combined with frequency or date format.
                     The size units are 'k', 'm' and 'g'. Units need to directly follow a number e.g. 1g, 100m, 20k.
 - *max_logs*        Max number of logs to keep. If not set, it won't remove past logs. It uses its own log audit file
                     to keep track of the log files in a json format. It won't delete any file not contained in it.
                     It can be a number of files or number of days. If using days, add 'd' as the suffix.
 - *audit_file*      Location to store the log audit file. If not set, it will be stored in the root of the application.
 - *end_stream*      End stream (true) instead of the destroy (default: false). Set value to true if when writing to the
                     stream in a loop, if the application terminates or log rotates, data pending to be flushed might be lost.       
 - *file_options*    An object passed to the stream. This can be used to specify flags, encoding, and mode.
                     See https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options. Default `{ flags: 'a' }`.             
 - *utc*             Use UTC time for date in filename. Defaults to 'FALSE'
 - *extension*       File extension to be appended to the filename. This is useful when using size restrictions as the rotation
                     adds a count (1,2,3,4,...) at the end of the filename when the required size is met.
 - *watch_log*       Watch the current file being written to and recreate it in case of accidental deletion. Defaults to 'FALSE'
 - *create_symlink*  Create a tailable symlink to the current active log file. Defaults to 'FALSE'
 - *symlink_name*    Name to use when creating the symbolic link. Defaults to 'current.log'
 - *audit_hash_type* Use specified hashing algorithm for audit. Defaults to 'md5'. Use 'sha256' for FIPS compliance.
 

## Example Usage
```javascript
    // Default date added at the end of the file
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test.log", frequency:"daily", verbose: false});
 
    // Default date added using file pattern
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test-%DATE%.log", frequency:"daily", verbose: false});
 
    // Custom date added using file pattern using moment.js formats
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test-%DATE%.log", frequency:"daily", verbose: false, date_format: "YYYY-MM-DD"});
 
    // Rotate when the date format as calculated by momentjs is different (e.g monthly)
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test-%DATE%.log", frequency:"custom", verbose: false, date_format: "YYYY-MM"});
 
    // Rotate when the date format as calculated by momentjs is different (e.g weekly)
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test-%DATE%.log", frequency:"custom", verbose: false, date_format: "YYYY-ww"});
 
    // Rotate when the date format as calculated by momentjs is different (e.g AM/PM)
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test-%DATE%.log", frequency:"custom", verbose: false, date_format: "YYYY-MM-DD-A"});
 
    // Rotate on given minutes using the 'm' option i.e. 5m or 30m
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test.log", frequency:"5m", verbose: false});
     
    // Rotate on the hour or any specified number of hours
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test.log", frequency:"1h", verbose: false});

    // Rotate on the hour or any specified number of hours and keep 10 files
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test.log", frequency:"1h", verbose: false, max_logs: 10});

    // Rotate on the hour or any specified number of hours and keep 10 days
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test.log", frequency:"1h", verbose: false, max_logs: "10d"});

    // Rotate on the hour or any specified number of hours and keep 10 days and store the audit file in /tmp/log-audit.json
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/test.log", frequency:"1h", verbose: false, max_logs: "10d", audit_file: "/tmp/log-audit.json"});

    // Rotate by file size only without date included in the name. Iteration will be added at the end.
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/logfile", size:"50k", max_logs: "5", audit_file:"/tmp/logaudit.json"});

    // Rotate by file size only without date included in the name. Rotation added before the extension.
    var rotatingLogStream = require('file-stream-rotator').getStream({filename:"/tmp/logfile", size:"50k", max_logs: "5", audit_file:"/tmp/logaudit.json". extension: ".log"});


    //.....    
    
    // Use new stream in express
    app.use(express.logger({stream: rotatingLogStream, format: "default"}));
    
    //.....

```
    
You can listen to the *open*, *close*, *error* and *finish* events generated by the open stream. You can also listen for custom events:

  * *rotate*: that will pass two parameters to the callback: (*oldFilename*, *newFilename*)
  * *new*: that will pass one parameter to the callback: *newFilename*
  * *logRemoved*: that will pass one parameter to the callback: {*date*: unix_timestamp, *name*: filename_deleted, *hash*: log_file_unique_idenfifier} 
  
You can also limit the size of each file by adding the size option using "k", "m" and "g" to specify the size of the file in kiloybytes, megabytes or gigabytes. When it rotates a file based on size, it will add a number to the end and increment it for every time the file rotates in the given period as shown below.
  
```
  3078  7 Mar 13:09:58 2017 testlog-2017-03-07.13.09.log.20
  2052  7 Mar 13:10:00 2017 testlog-2017-03-07.13.09.log.21
  3078  7 Mar 13:10:05 2017 testlog-2017-03-07.13.10.log.1
  3078  7 Mar 13:10:08 2017 testlog-2017-03-07.13.10.log.2
  3078  7 Mar 13:10:11 2017 testlog-2017-03-07.13.10.log.3
  3078  7 Mar 13:10:14 2017 testlog-2017-03-07.13.10.log.4
```  

  The example below will rotate files daily but each file will be limited to 5MB.
  
```javascript
    // Rotate every day or every 5 megabytes, whatever comes first.
    var rotatingLogStream = require('file-stream-rotator').getStream(
        {
            filename:"/tmp/test-%DATE%.log", 
            frequency:"custom", 
            verbose: false, 
            date_format: "YYYY-MM-DD",
            size: "5M" // its letter denominating the size is case insensitive
        }
    );
    rotatingLogStream.on('rotate',function(oldFile,newFile){
        // do something with old file like compression or delete older than X days.
    })
```

## NPM Maintainers

The npm module for this library will be maintained by:

* [Roger C](http://github.com/rogerc)

## Contributors

Thanks to the contributors below for raising PRs and everyone else that has raised issues to make the module better.

* [Matt Berther](https://github.com/mattberther)
* [nickbug](https://github.com/nickbug)
* [André Farzat](https://github.com/andrefarzat)
* [Thibault.P](https://github.com/DrPlop)

## License

file-stream-rotator is licensed under the MIT license.
