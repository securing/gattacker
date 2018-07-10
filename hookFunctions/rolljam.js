var fs = require('fs');
var colors = require('colors');
var utils = require('../lib/utils');

/*
 * RollJam hook helper by @FlUxIuS
 */


// RollJam vars
var rolljam_cmd1=[];
var rolljam_cmd2=[];
var rolljam_ctr = 0;
var rolljam_ctr2 = 0;
var rjconfig = JSON.parse(fs.readFileSync('hookFunctions/RollJam.json'));

function getDateTime() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var msec  = date.getMilliseconds();
    msec = (msec < 100 ? "0" : "") + msec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return year + "." + month + "." + day + " " + hour + ":" + min + ":" + sec + '.' + msec;
}

function RollJamLog(type, peripheralId, serviceUuid, uuid, data){
    /*
     *  Logs only write commands in a special file with *.rolljam extension
     * */
    var dumpFile='dump/' + peripheralId + '.rolljam';
    var toSave = getDateTime() + ' | ' + type + ' | ' + serviceUuid;
    toSave += ' | ' + uuid;
    toSave += ' | ' + data.toString('hex') + ' (' + utils.hex2a(data.toString('hex'))+ ')\n';

    if (type  === '< W') {
    	fs.appendFile(dumpFile, toSave, function(err) {
      		if(err) {
          		return console.log(err);
      		}
    	})
    }
}

function RollJamWrite(peripheralId, service, characteristic, type, data, wsclient, callback) {
	/*
	 * Capturing commands defined in the RollJam.json file and playing only commands of the first session
	 */
	datastr = data.toString('hex');
	commands = rjconfig.commands
	for(var key in commands){ // Looking for all defined commands substrings
		value = commands[key];
		if (datastr.substring(0,key.length) === key)  {
			if (rolljam_ctr === value.number-1) { // if a substring is found and it 
		    		console.log('[RollJam] Keeping 1st cmd key part '+value.number+': '.yellow + datastr.yellow.inverse);
		    		rolljam_cmd1.push(data);
		    		data = new Buffer(value.to, 'hex');
                    		console.log('[RollJam] Playing incomplete cmd: '.yellow + data.toString('hex').yellow.inverse);
				rolljam_ctr++;
	        	} else { // Keeping 2nd session cmds and pushing first captured ones
		    		console.log('[RollJam] Keeping 2nd cmd key part '+value.number+': '.yellow + datastr.yellow.inverse);
		    		rolljam_cmd2.push(data);
				RollJamLog('< W', peripheralId, service, characteristic, data);
		    		data = rolljam_cmd1[value.number-1];
		    		console.log('[RollJam] Playing 1st cmd key instead, part '+value.number+': '.yellow + data.toString('hex').yellow.inverse);
				rolljam_ctr2++;
				
				if (rolljam_ctr === rolljam_ctr2)
				{ // At the end: reinit the RollJam process
					rolljam_ctr = 0;
					rolljam_ctr2 = 0;
				}
                	}
		}
	}
        callback(null, data);
}

module.exports.RollJamWrite = RollJamWrite;
