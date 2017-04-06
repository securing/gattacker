require('env2')('config.env');

var debug = require('debug')('replay');
var fs = require('fs');
var util = require('util');
var utils = require('./lib/utils')
var path=require('path');
var events = require('events');
var getopt = require('node-getopt');
var async = require('async');

var options = new getopt([
  ['i' , 'input=FILE'  , 'input file'],
  ['s' , 'services=FILE'  , 'services json input file'],
  ['p' , 'peripheral=MAC' , 'target peripheral MAC'],
  ['h' , 'help' , 'display this help'],
]);
options.setHelp("Usage: node replay -i <FILE> -p <MAC> [ -s <FILE> ]\n[[OPTIONS]]" )

opt=options.parseSystem();

if ( !opt.options.input || !opt.options.peripheral)  {
  console.info(options.getHelp());
  process.exit(0);
}
var peripheralId = opt.options.peripheral;

if (opt.options.services) {
  if (opt.options.services.indexOf('.srv.json') > -1 ) {
    servicesFile=opt.options.services;
  } else {
    servicesFile=opt.options.services + '.srv.json';
  }
} else {
  var devicesPath=process.env.DEVICES_PATH;
  servicesFile = devicesPath+ '/'+peripheralId+'.srv.json';
}

var services = JSON.parse(fs.readFileSync(servicesFile, 'utf8'));
var waiting = false;

var wsclient = require('./lib/ws-client');

var inputData = fs.createReadStream(opt.options.input,'utf8');


function readLines(input, func) {
  var remaining = '';

  input.on('data', function(data) {
    remaining += data;
    var index = remaining.indexOf('\n');
    var last  = 0;
    while (index > -1) {
      var line = remaining.substring(last, index);
      last = index + 1;
      func(line);
      index = remaining.indexOf('\n', last);
    }

    remaining = remaining.substring(last);
  });

  input.on('end', function() {
    if (remaining.length > 0) {
      func(remaining);
    }
  });
}

function parse(line) {

  if(waiting) {//we want it to match
        console.log('LINE: ' + line);
        setTimeout(parse(line), 500);//wait 50 millisecnds then recheck
        return;
  }

  var arr=line.split('|');
  var operator = arr[1].trim();
  var serviceUuid = arr[2].trim().split(' ')[0]; //split(' ') to remove optional description
  var uuid = arr[3].trim().split(' ')[0];
  var data = arr[4].trim().split(' ')[0];

  switch(operator) {
    case '< W' : console.log('WRITE REQ: '.blue + data ); 
                 wsclient.write(peripheralId, serviceUuid, uuid, new Buffer(data,'hex'), true , function(error) {
                   if (error){
                     console.log('------ Write error: '.red);
                     throw(error);
                   } 
                 }); break;
    case '< C' : console.log('WRITE CMD: '.blue + data ); 
                 wsclient.write(peripheralId, serviceUuid, uuid, new Buffer(data,'hex'), false , function(error) {
                   if (error){
                     console.log('------ Write error: '.red);
                     throw(error);
                   } 
                 }); break;

    case '> R' : console.log('READ: '.grey + data + ' --- skip'); 
                 break
    case '> N' : console.log('NOTIFICATION: '.grey + data + ' --- skip'); 
                 break
  }

}

//wait for the ws connection
wsclient.on('ws_open', function(){
    wsclient.getMac(function(address){
      myAddress = address;
      console.log('Noble MAC address : ' + myAddress);
    })
    wsclient.initialize(peripheralId, services, true, function(){
      console.log('initialized !');
      readLines(inputData,parse);
    })
});
