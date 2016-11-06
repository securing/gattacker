// BlueRadios BLE AT interface 
// For AT commands reference:
// https://github.com/ideo-digital-shop/ble-arduino/tree/master/documentation/docs

require('env2')('../config.env');

if (process.argv.length < 3) {
	console.log('Usage: node ' + process.argv[1] + ' <peripheralid>');
	process.exit(0);
}

var peripheralId = process.argv[2].toLowerCase();

var wsclient = require('../lib/ws-client.js')
var colors=require('colors');

var blueRadiosService = 'da2b84f1627948debdc0afbea0226079';
var blueRadiosCmdCharacteristic = 'a87988b9694c479c900e95dfa6c00a24';
var blueRadiosRxCharacteristic = '18cda7844bd3437085bbbfed91ec86af';
var blueRadiosTxCharacteristic = 'bf03260c72054c25af4393b1c299d159';


console.log('start');

var stdin = process.openStdin();

//listen for command-line parameters from console
stdin.addListener("data", function(d) {
	blueRadiosAT(d.toString().trim());
});


wsclient.on('ws_open', function(){
	//param: peripheralId
	wsclient.initialize(peripheralId, '', true, function(){
		console.log('Initialized!')
		// it will not wait for the connection
		wsclient.clientConnection('00:00:00:00:00:00', true);
		//battery level
		//blueRadiosAT('ATBL?');
		  checkLocked();
	});
})

wsclient.on('explore', function(peripheralId, state, servicesJson){

  console.log('explore state: ' + peripheralId + ' : ' + state);
  if(state === 'finished') {
  	checkServices(servicesJson);
  }
})


//check if the device has blueRadios service/characteristics
function checkServices(servicesJson) {
	//console.log(util.inspect(servicesJson))
	for (serviceId in servicesJson) {
		service=servicesJson[serviceId]
		if (service.uuid === blueRadiosService) {
			console.log('BlueRadios service UUID found!')
			//check for characteristics?
			return true;
		}
	}
}


function readName(){
  wsclient.read('1800','2a00', function(data) {
    console.log('Device name: ' + data);
  });
}


function checkLocked(){
	console.log('ATSCL? - check if the service is locked : 0 = unlocked');
	blueRadiosAT('ATSCL?');
}


//command - string
function blueRadiosAT(command){
	if (! wsclient.listeners('notification').length) {
		console.log('subscribe to RX notification');
		//listen for notification response
		wsclient.on('notification', function(peripheralId, serviceUuid, characteristicUuid, data) {
	//		console.log("NOTIFICATION: " + data.toString('hex') + ' : ' + data.toString('ascii').yellow);
			console.log(data.toString('ascii').trim().yellow);
		});		
	}

	//convert command to hex, add CR (0x0d = \r) at the end
	var hexCommand = new Buffer(command + '\r','ascii');

	wsclient.notify(peripheralId, blueRadiosService,blueRadiosRxCharacteristic,true, function() {
		wsclient.write(peripheralId, blueRadiosService,blueRadiosCmdCharacteristic, new Buffer('02','hex'), false, function(error) {
			console.log('Switch to CMD mode');
			wsclient.write(peripheralId, blueRadiosService, blueRadiosTxCharacteristic, hexCommand, false, function(){
				console.log('sent CMD: ' + command.cyan);
			})
		})
	});
}

