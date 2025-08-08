var moment = require('moment');
// var rotatingLogStream = require('../FileStreamRotator').getStream({filename:"/tmp/testlog-%DATE%.log", frequency:"1m", verbose: true});
// var rotatingLogStream = require('../FileStreamRotator').getStream({filename:"/tmp/testlog-%DATE%.log", frequency:"custom", verbose: true, date_format: "YYYY-MM-DD.HH.mm"});
// var rotatingLogStream = require('../FileStreamRotator').getStream({filename:"/tmp/testlog-%DATE%.log", frequency:"dont-rotate", verbose: true, date_format: "YYYY-MM-DD.HH.mm.ss"});
// var rotatingLogStream = require('../FileStreamRotator').getStream({filename:"/tmp/testlog-%DATE%.log", frequency:"daily", verbose: true, date_format: "YYYYMMDD"});
// var rotatingLogStream = require('../FileStreamRotator').getStream({filename:"/tmp/testlog-%DATE%.log", frequency:"daily", verbose: true});
// var rotatingLogStream = require('../FileStreamRotator').getStream({
//     filename:"logs/nodate/%DATE%", 
//     frequency:"custom", 
//     verbose: true, 
//     date_format: "[test]", 
//     size:"50k",
//     max_logs: "5", 
//     audit_file:"audit-nodate.json",
//     end_stream: false,
//     utc: true,
//     extension: ".log",
//     watch_log: true,
//     audit_hash_type: 'sha256'
// });

// var rotatingLogStream = require('../FileStreamRotator').getStream({
//     filename:"logs/nodate/%DATE%", 
//     frequency:"custom", 
//     verbose: true, 
//     date_format: "[LOGFILENAME]", 
//     size:"50k",
//     max_logs: "5", 
//     audit_file:"audit-nodate.json",
//     end_stream: false,
//     extension: ".log"
// });

// var rotatingLogStream = require('../FileStreamRotator').getStream({filename:"logs/nodate/logfile", size:"50k", max_logs: "5", audit_file:"audit-nodate.json", end_stream: false, extension: ".log" });

// var rotatingLogStream = require('../FileStreamRotator').getStream({filename:"logs/nodate/logfile", size:"50k", max_logs: "5", audit_file:"audit-nodate.json"});

var rotatingLogStream = require('../FileStreamRotator').getStream({
    filename:"logs/nodate/logfile", 
    verbose: true, 
    size:"50k",
    // max_logs: "5", 
    audit_file:"audit-nodate.json",
    end_stream: false,
    extension: ".log"
});

rotatingLogStream.on("error",function(err){
    console.log(Date.now(), Date(), "stream error", err)
    process.exit()
})


rotatingLogStream.on("close",function(){
    console.log(Date.now(), Date(), "stream closed")
})

rotatingLogStream.on("finish",function(){
    console.log(Date.now(), Date(), "stream finished")
})

rotatingLogStream.on("rotate",function(oldFile,newFile){
    console.log(Date.now(), Date(), "stream rotated",oldFile,newFile);
})

rotatingLogStream.on("open",function(fd){
    console.log(Date.now(), Date(), "stream open",fd);
})

rotatingLogStream.on("new",function(newFile){
    console.log(Date.now(), Date(), "stream new",newFile);
})

rotatingLogStream.on("addWatcher", function(newLog){
    console.log(Date.now(), Date(), "stream add watcher",newLog);
})

// console.log(rotatingLogStream.on, rotatingLogStream.end, rotatingLogStream)

var counter = 0;
var i = setInterval(function(){
    counter++;
    // rotatingLogStream.write(Date() + "\ttesting 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890-testing 1234567890\n")
    rotatingLogStream.write(Date() + "ニューバランスの100年を超える長い歴史\n")
    // if(counter == 2000){
    if(counter == 400){
        clearInterval(i);
        console.log(Date() + "\tEND STREAM");
        rotatingLogStream.end("end\n");
        return;
    }

    //*
    rotatingLogStream.write(Date() + "\t");
    for(var y = 0; y<400; y++){
        // console.log(i + " ")
        // rotatingLogStream.write(y + ": " + Date.now() + " >> ");
        rotatingLogStream.write("適: " + Date.now() + " >> ");
    }
    // */
    rotatingLogStream.write("\n");
}, 10);

