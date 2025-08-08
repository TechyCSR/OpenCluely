var fsr = require('./index');
var assert = require('assert');
var fs = require('fs');

var tests = {
    testFileSizes: function () {
        [
            ["3k",3072],
            ["5M",5242880],
            ["0.5G",536870912],
            ["0.5T",null],
            ["1mega",null],
            ["10 giga",null]
        ].map(function(fsize){
            console.log(fsize[0],fsize[1],fsr.parseFileSize(fsize[0]));
            assert.ok(fsize[1] == fsr.parseFileSize(fsize[0]));
        })
    },
    testFrequency: function () {
        var opt1 = 'M544';
        var opt2 = '5m';
        var opt3 = '1H';
        var opt4 = '3h';
        var opt5 = 'daily';
        var opt6 = 'test';
        var opt7 = '3W';
        var opt8 = '-1h';
        var opt9 = '25h';
        var opt10 = '24h';
        var opt11 = '23h';
        var opt12 = '59m';
        var opt13 = '60m';
        var opt14 = '61m';
        var opt15 = '-1m';


        assert.ok(!fsr.getFrequency(opt1));

        var obj = fsr.getFrequency(opt2);
        console.log('obj =', obj);
        assert.ok(typeof  obj == 'object');
        assert.equal(obj.type, 'm');
        assert.equal(obj.digit, 5);

        obj = fsr.getFrequency(opt3);
        assert.ok(typeof  obj == 'object');
        assert.equal(obj.type, 'h');
        assert.equal(obj.digit, 1);

        obj = fsr.getFrequency(opt4);
        assert.ok(typeof  obj == 'object');
        assert.equal(obj.type, 'h');
        assert.equal(obj.digit, 3);

        obj = fsr.getFrequency(opt5);
        assert.ok(typeof  obj == 'object');
        assert.equal(obj.type, 'daily');
        assert.equal(obj.digit, undefined);

        obj = fsr.getFrequency(opt6);
        assert.ok(typeof  obj == 'object');
        assert.equal(obj.type, 'test');
        assert.equal(obj.digit, 0);

        obj = fsr.getFrequency(opt7);
        assert.ok(obj === false);

        obj = fsr.getFrequency(opt8);
        assert.ok(obj === false);

        obj = fsr.getFrequency(opt9);
        assert.ok(obj === false);

        obj = fsr.getFrequency(opt10);
        console.log('obj =', obj);
        assert.ok(typeof obj == 'object');
        assert.equal(obj.type, 'h');
        assert.equal(obj.digit, 24);

        obj = fsr.getFrequency(opt11);
        console.log('obj =', obj);
        assert.ok(typeof obj == 'object');
        assert.equal(obj.type, 'h');
        assert.equal(obj.digit, 23);

        obj = fsr.getFrequency(opt12);
        assert.ok(typeof obj == 'object');
        assert.equal(obj.type, 'm');
        assert.equal(obj.digit, 59);

        obj = fsr.getFrequency(opt13);
        assert.ok(typeof obj == 'object');
        assert.equal(obj.type, 'm');
        assert.equal(obj.digit, 60);

        obj = fsr.getFrequency(opt14);
        assert.ok(obj === false);

        obj = fsr.getFrequency(opt15);
        assert.ok(obj === false);
    },
    testGetDate: function () {
        var opt = {type: 'test', digit: 0};
        var opt1 = {type: 'daily', digit: 0};
        var opt2 = {type: 'h', digit: 1};
        var opt3 = {type: 'm', digit: 30};
        var opt4 = {type: 'm', digit: 45};
        var opt5 = {type: 'h', digit: 3};
        var opt6 = {type: 'm', digit: 5};

        var format1 = 'YYYYMMDD';
        var format2 = 'YYYY-MM-DD';
        var format3 = 'YYYYMMDD.HHmmss';
        var format4 = 'YYYY-MM-DD:HH:mm:ss';

        console.log(fsr.getDate(opt));
        console.log(fsr.getDate(opt1));
        console.log(fsr.getDate(opt2));
        console.log(fsr.getDate(opt3));
        console.log(fsr.getDate(opt4));
        console.log(fsr.getDate(opt5));
        console.log(fsr.getDate(opt6));

        console.log(fsr.getDate({type: 'test', digit: 0},format1));
        console.log(fsr.getDate({type: 'test', digit: 0},format2));
        console.log(fsr.getDate({type: 'test', digit: 0},format3));
        console.log(fsr.getDate({type: 'test', digit: 0},format4));
    },
    testAuditSettings: function(){
        var a = fsr.setAuditLog("10d","","/tmp/a/b/c/files/%DATE%/logs");
        console.log(a)
        assert.equal(a.auditLog,"/tmp/a/b/c/files/.audit.json");
        assert.equal(a.keep.amount,10);
        assert.equal(a.keep.days,true);
        assert.equal(a.files.length,0);

        a = fsr.setAuditLog("10","/tmp/a/b/log_audit_file.json","/tmp/a/b/c/files/%DATE%/logs1");
        console.log(a)
        assert.equal(a.auditLog,"/tmp/a/b/log_audit_file.json");
        assert.equal(a.keep.amount,10);
        assert.equal(a.keep.days,false);
        assert.equal(a.files.length,0);

        // var b = fsr.writeAuditLog({keep:{days:true,amount:10},auditLog: "/tmp/aa/a/e/a/b/c/a/b/b/ba_log.json",files:[{date:Date.now(), name:"/tmp/a/b/c.log"}]});

    },
    testGetStream: function() {
        return;

        var logdir = __dirname + '/log/';

        var test = function() {

            var options1 = { filename: logdir + 'program1.log', frequency: '1m', verbose: true, date_format: 'YYYY-MM-DD' };
            var options2 = { filename: logdir + 'program2.log', frequency: '1m', verbose: true};
            var options3 = { filename: logdir + 'program3-%DATE%.log', frequency: '1m', verbose: true, date_format: 'YYYY-MM-DD'};
            var options4 = { filename: logdir + 'program4-%DATE%.log', verbose: true, date_format: 'YYYY-MM-DD'};
            var options5 = { filename: logdir + 'program5-%DATE%.log', verbose: true};

            var stream1 = fsr.getStream(options1);
            stream1.write('formatted date');
            var stream2 = fsr.getStream(options2);
            stream2.write('default date');
            var stream3 = fsr.getStream(options3);
            stream3.write('date mid filename');
            var stream4 = fsr.getStream(options4);
            stream4.write('date mid filename without rotation');
            var stream5 = fsr.getStream(options5);
            stream5.write('dafault date mid filename without rotation');


            var options = { filename: logdir + 'program-%DATE%.log', frequency: '1m', verbose: true, date_format: 'YYYY-MM-DD:HH:mm' };

            var stream = fsr.getStream(options);
            process.__defineGetter__('stdout', function() { return stream;});
            process.__defineGetter__('stderr', function() { return stream;});

            setTimeout(function(){
                stream.write('Foo bar');
            }, 3000)

            setTimeout(function(){
                stream.write('Foo bar');
            }, 60000);
        }

        fs.exists(logdir, function(exists) {
            if(!exists) {
                console.log('Creating the log directory as one doesnt exist');
                fs.mkdir(logdir, function(err) {
                    if(err) {
                        console.error('Trouble creating directory %s', logdir);
                        throw err;
                    }
                    test();
                });
            }else{
                test();
            }
        });
    },
}

Object.keys(tests).forEach(function (test) {
    if (typeof tests[test] == 'function') {
        tests[test]();
    }
});