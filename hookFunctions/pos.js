var fs = require('fs');
var colors = require('colors');
var utils = require('../lib/utils');

var actNotify = false;
var actWrite = '';


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
    		//todo: to callback
        	return console.log(err);
    	}
    //console.log("The file was saved!");
  	}); 

  	callback(null, data);
}



function posNotify(peripheralId, service, characteristic, type, data, notifyEmitter, callback){

	console.log('    dynamic notify hook'.yellow);
	datastr = data.toString('hex');

	console.log('    data' + datastr);

	callback(null, new Buffer(datastr,'hex'));

}


function posWrite(peripheralId, service, characteristic, type, data, wsclient, callback){

	posWriteHacked(peripheralId, service, characteristic, type, data, wsclient, callback);

}


function posWriteHacked(peripheralId, service, characteristic, type, data, wsclient, callback){
	datastr = data.toString('hex');
	if (actWrite === 'displayswitch') {
		datastr='62790cff0c0c0efc5365637552696e672e706c0c'
		console.log('    Switch text                                                                 : '.red  + datastr.red.inverse + '(' + utils.hex2a(datastr)+')');
		actWrite='';
		callback(null, new Buffer(datastr,'hex'));
		wsclient.write(peripheralId, service,characteristic, new Buffer('ff0ef8a361030e0f','hex'),false)
	}
	else if (datastr.substring(0,10) === '020c190301')  { // "enter card"
		actWrite='displayswitch';
		datastr = '020c2403010b0c0c0c020c0efa4861636b656420'
		console.log('    Switch text                                                                 : '.red  + datastr.red.inverse + '(' + utils.hex2a(datastr)+')');
		callback(null, new Buffer(datastr,'hex'));

	} else {
		console.log('             pos write hook - forwarding without modification                   : '.yellow + datastr.yellow.inverse);
		callback(null, data);
	}
}




function posWriteBH(peripheralId, service, characteristic, type, data, wsclient, callback){
	datastr = data.toString('hex');
	if (actWrite === 'displayswitch') {
		datastr='2067726565740cff0ef8a84f030e0f'
		console.log('    Switch text                                                                 : '.red  + datastr.red.inverse + ' (' + utils.hex2a(datastr)+')');
		actWrite='';
		callback(null, new Buffer(datastr,'hex'));
	}
	else if (datastr.substring(0,10) === '020c190301')  { // "enter card"
		actWrite='displayswitch';
		datastr = '020c1903010b0c0c0c010c0f426c61636b486174'
		console.log('    Switch text                                                                 : '.red  + datastr.red.inverse + ' (' + utils.hex2a(datastr)+')');
		callback(null, new Buffer(datastr,'hex'));

	} else {
		console.log('             pos write hook - forwarding without modification                   : '.yellow + datastr.yellow.inverse);
		callback(null, data);
	}
}



module.exports.customLog = customLog;
module.exports.posNotify = posNotify;
module.exports.posWrite = posWrite;
module.exports.posWriteBH = posWriteBH;
module.exports.posWriteHacked = posWriteHacked;
