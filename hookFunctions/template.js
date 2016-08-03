var fs = require('fs');
var colors = require('colors');
var utils = require('../lib/utils');

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


module.exports.customLog = customLog;