require('env2')('config.env');

var debug = require('debug')('advertise');
var bleno = require('./lib/bleno');
var fs = require('fs');
var util = require('util');
var utils = require('./lib/utils')
var hookFunctions = require('./hookFunctions/pos.js');
var path=require('path');
var events = require('events');
var getopt = require('node-getopt');

var options = new getopt([
  ['a' , 'advertisement=FILE'  , 'advertisement json file'],
  ['s' , 'services=FILE'       , 'services json file'],
  ['S' , 'static'              , 'static - do not connect to ws-slave/target device'],
  ['f' , 'funmode'             , 'have fun!'], 
  [''  , 'jk'                  , 'see http://xkcd.com/1692'],
  ['h' , 'help'                , 'display this help'],
  ['w' , 'hooksfile=FILE'  , 'hook function'],
]);
options.setHelp("Usage: node advertise -a <FILE> [ -s <FILE> ]  [-S] \n[[OPTIONS]]" )

opt=options.parseSystem();

if ( !opt.options.advertisement)  {
  console.info(options.getHelp());
  process.exit(0);
}

if (opt.options.help) {
  options.showHelp();
  process.exit(0);
}

if (opt.options.funmode) {
  console.log('>>>>>>>>>>>>>>>>> MAY THE FUN BE WITH YOU! <<<<<<<<<<<<<<<<<<'.rainbow.inverse);
}

if (opt.options.hooksfile) {
  hookFunctions = require('./hookFunctions/'+opt.options.hooksfile);
}

var devicesPath=process.env.DEVICES_PATH;
var dumpPath=process.env.DUMP_PATH;
var myAddress = '';
var mitmservices;
var servicesLookup = [];

//keep hooks and notify subsciptions 
var subscriptions=[];
var hookTable=[];

//list of active notify subscriptions
var subscriptions = [];


if (opt.options.static) {
  staticRun = true;
  //local eventEmitter to get events from hook functions
  var wsclient = new events.EventEmitter();
  wsclient.write = function (peripheralId, serviceUuid, uuid) { console.log('static run write not defined in hooks ' + getServiceNames(serviceUuid, uuid)); };
  wsclient.read = function (peripheralId, serviceUuid, uuid) { console.log('static run read not defined in hooks '+ getServiceNames(serviceUuid, uuid)); };
  wsclient.notify = function (peripheralId, serviceUuid, uuid) { console.log('static run subscribe '+ getServiceNames(serviceUuid, uuid)); };
  wsclient.write();

} else {
  staticRun = false;
  var wsclient = require('./lib/ws-client');
}

baseAdvFile=path.basename(opt.options.advertisement);
var peripheralId = baseAdvFile.substring(0, baseAdvFile.indexOf("_"));
console.log("peripheralid: " + peripheralId)


if (opt.options.advertisement.indexOf('.adv.json') > -1 ) {
  advertisementFile=opt.options.advertisement;
} else {
  advertisementFile=opt.options.advertisement + '.adv.json';
}

console.log('advertisement file: ' + advertisementFile)

var advertisement = JSON.parse(fs.readFileSync(advertisementFile, 'utf8'));
var eir = new Buffer(advertisement.eir,'hex');
var scanResponse = advertisement.scanResponse ? new Buffer(advertisement.scanResponse, 'hex') : '';

console.log("EIR: " + eir.toString('hex'));
console.log("scanResponse: " + scanResponse.toString('hex'));

if (opt.options.services) {
  if (opt.options.services.indexOf('.srv.json') > -1 ) {
    servicesFile=opt.options.services;
  } else {
    servicesFile=opt.options.services + '.srv.json';
  }
} else {
  servicesFile = devicesPath+ '/'+peripheralId+'.srv.json';
}

var services = JSON.parse(fs.readFileSync(servicesFile, 'utf8'));


setServices(services, function(services){
  mitmservices=services;
})


if (!staticRun) {
  //wait for the ws connection
  wsclient.on('ws_open', function(){
    wsclient.getMac(function(address){
      myAddress = address;
      console.log('Noble MAC address : ' + myAddress);
    })
    wsclient.initialize(peripheralId, services, true, function(){
      console.log('initialized !');
      startAdvertising();
    })
  });
} else {
  startAdvertising();
}

function startAdvertising(){
  if (bleno.state != 'poweredOn') {
    console.log('waiting for interface to initialize...');
    bleno.once('stateChange', function(state){
      if (state === 'poweredOn') {
        bleno.startAdvertisingWithEIRData(eir,scanResponse);    
      } else {
        console.log('Interface down! Exiting...');
        process.exit(1);
      }
    }) 
  } else {
     console.log('Static - start advertising');
     bleno.startAdvertisingWithEIRData(eir,scanResponse);  
  }
}

//return name of service and characteristic (as defined in input json file)
function getServiceNames(serviceUuid, uuid) {
    if (servicesLookup[serviceUuid]) {
      var serviceName = servicesLookup[serviceUuid].name;
      var characteristicName = servicesLookup[serviceUuid].characteristics[uuid].name;      
    }

    var info = serviceUuid;
    if (serviceName) { info += ' (' + serviceName + ')' };
    info +=' -> ' + uuid;
    if (characteristicName) { info += ' (' + characteristicName +' )' }

    return info;
}

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


//dump transmission log to file
function dumpLog(type, peripheralId, serviceUuid, uuid, data ){

    var dumpFile=dumpPath + '/' + peripheralId + '.log';

    if (servicesLookup[serviceUuid]) {
      var serviceName = servicesLookup[serviceUuid].name;
      var characteristicName = servicesLookup[serviceUuid].characteristics[uuid].name;      
    }

    var toSave = getDateTime() + ' | ' + type + ' | ' + serviceUuid;
    if (serviceName) { toSave += ' (' + serviceName + ')'; };
    toSave += ' | ' + uuid;
    if (characteristicName) { toSave += ' (' + characteristicName + ')';  };
    toSave += ' | ' + data.toString('hex') + ' (' + utils.hex2a(data.toString('hex'))+ ')\n';

    fs.appendFile(dumpFile, toSave, function(err) {
      if(err) {
          return console.log(err);
      }
    })
}


bleno.on('stateChange', function(state) {
    console.log('BLENO - on -> stateChange: ' + state);
    if (state === 'poweredOn') {
//              console.log('poweredOn');
    } else {
       console.log('Interface down! Reset/power it up again...')
       bleno.stopAdvertising();
    }
});

bleno.on('advertisingStart', function(error) {
      console.log('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));

    if (error) {
              console.log("Adv error ".red,error);
    } else {
        bleno.setServices( mitmservices, function(error){
            console.log('setServices: '  + (error ? 'error ' + error : 'success'));
            console.log(' <<<<<<<<<<<<<<<< INITIALIZED >>>>>>>>>>>>>>>>>>>> '.magenta.inverse)
        });
    }
});

bleno.on('accept', function(clientAddress) {
      console.log('Client connected: ' + clientAddress);

      if (clientAddress === myAddress) {
        console.log('SELF CONNECT!');
        bleno.disconnect();
      } else {
        if (!staticRun) {
          //notify the ws-slave of victim's connection
           wsclient.clientConnection(clientAddress, true);          
        }
      }

    bleno.updateRssi();
});


//update the ws-slave on client disconnect
bleno.on('disconnect', function(clientAddress){
    console.log('Client disconnected: ' + clientAddress);
    if (!staticRun) {
      wsclient.clientConnection(clientAddress,false);
    }
})



wsclient.on('disconnect', function(peripheralId){
    console.log('      target device disconnected');
})

wsclient.on('connect', function(peripheralId){
    console.log('      target device connected');
})

//change the advertisement
wsclient.on('advchange', function(newEir, newScanResponse){
      bleno.stopAdvertising(function(){
        //wait 2 seconds after stopAdvertising, otherwise the HCI will often fail with "Command Disallowed"
        setTimeout(function() {
              console.log('Advertisement change: waited 2s for device, should work now...');
              console.log('  old ' + eir.toString('hex') + ' ('+ utils.hex2a(eir) +') '+ ' : ' + scanResponse.toString('hex') + ' ('+ utils.hex2a(scanResponse) +')');
              console.log('  new ' + newEir.toString('hex') + ' ('+ utils.hex2a(newEir) +') '+ ' : ' + newScanResponse.toString('hex') + ' ('+ utils.hex2a(newScanResponse) +') ');
              bleno.startAdvertisingWithEIRData(newEir,newScanResponse);
              eir=newEir;
              scanResponse=newScanResponse;
          }, 2000);
      });
})


//listen to all notifications, invoke appropriate subscription callbacks
wsclient.on('notification', function(peripheralId, serviceUuid, uuid, data) {

    if (servicesLookup[serviceUuid]) {
      var serviceName = servicesLookup[serviceUuid].name;
      var characteristicName = servicesLookup[serviceUuid].characteristics[uuid].name;      
    }

    console.log('<< Notify: '.green + getServiceNames(serviceUuid,uuid) + ' : ' + data.toString('hex').green.inverse + ' (' + utils.hex2a(data.toString('hex')) + ')');
//    console.log('forwarding...');
    
    dumpLog('> N',peripheralId, serviceUuid, uuid, data);

    if (hookTable[serviceUuid]) {
      var hook = hookTable[serviceUuid][uuid];
    }

    if (hook) {
       if (hook.staticNotifyValue) {
          var data = hook.staticValue;
          console.log('<< Notify static val: '.green + data.toString('hex').green.inverse + ' (' + utils.hex2a(data.toString('hex'))+ ')');
          //return the static value
          callback(result, new Buffer(data,'hex'));
        } else if (hook.dynamicNotify) {
          hookFunctions[hook.dynamicNotify](peripheralId, serviceUuid, uuid, 'notify', data , wsclient, function(err, modifiedData){
            if (modifiedData) {
              console.log('<< Notify DATA hook                                                             : '.yellow + modifiedData.toString('hex').yellow.inverse + ' (' + utils.hex2a(modifiedData.toString('hex'))+ ')');
              if (subscriptions[serviceUuid] && subscriptions[serviceUuid][uuid]) {
                  subscriptions[serviceUuid][uuid](modifiedData);
              }
            } else {
              console.log('<< Notify DATA hook: '.yellow + 'intercept, not forwarding'.yellow);
            }
          })
        } else {
          //there are hooks, but not for notifications, invoke directly
          subscriptions[serviceUuid][uuid](data);          
        } 

    } else { // no hook, just send directly 

          if (!subscriptions[serviceUuid]) {
            //the ws-slave received notification from previous connection
             // console.log('Notification from previous connection, but services not set yet, not forwarding');
          } else {
            //invoke the subscription callback
            subscriptions[serviceUuid][uuid](data);            
          }
    }

});

function setServices(services, callback){

  var PrimaryService = bleno.PrimaryService;
  var Characteristic = bleno.Characteristic;
  var BlenoDescriptor = bleno.Descriptor;

  var mitmcharacteristics=[];
  var mitmservices = [];

  for (sindex = 0; sindex < services.length; ++sindex) {
    serviceToCopy = services[sindex];
    servicesLookup[serviceToCopy.uuid]= { characteristics: [] };
      debug("Setting up service: " + serviceToCopy.uuid);
      mitmcharacteristics=[];
      for (cindex = 0; cindex<serviceToCopy.characteristics.length; ++cindex) {
        characteristicToCopy = serviceToCopy.characteristics[cindex];

        servicesLookup[serviceToCopy.uuid].characteristics[characteristicToCopy.uuid] = { 
          name: characteristicToCopy.name,       
          properties: characteristicToCopy.properties
          // more info not needed yet
        };


        debug("   Setting up Characteristic: " + characteristicToCopy.uuid + ' Value: ' + characteristicToCopy.value + ' ('+utils.hex2a(characteristicToCopy.value)+')');
        debug("    StartHandle: " + characteristicToCopy.startHandle);
        debug("    ValueHandle: " + characteristicToCopy.valueHandle);
        debug("    Properties: " + characteristicToCopy.properties);
//        console.log("    Secure: " + characteristicToCopy.secure);

        if (characteristicToCopy.descriptors) { 
          debug("      Descriptors: " + util.inspect(characteristicToCopy.descriptors, {showHidden: false, depth: null})); 
        }

        if (characteristicToCopy.hooks) {
          if (!hookTable[serviceToCopy.uuid]) {
            hookTable[serviceToCopy.uuid]=[];
          } 
          if (!hookTable[serviceToCopy.uuid][characteristicToCopy.uuid]) {
            hookTable[serviceToCopy.uuid][characteristicToCopy.uuid] = characteristicToCopy.hooks;
          }
          debug("      hooks: " + util.inspect(characteristicToCopy.hooks, {showHidden: false, depth: null}));
        }

      var mitmcharacteristic = new Characteristic({
          uuid: characteristicToCopy.uuid,
          serviceUuid: serviceToCopy.uuid,
          name: characteristicToCopy.name,
          startHandle: characteristicToCopy.startHandle,
          valueHandle: characteristicToCopy.valueHandle,
          properties: characteristicToCopy.properties, 


//      targeted mobile application will not verify this anyway ;)
//          secure: [ ... ], // enable security for properties, can be a combination of 'read', 'write', 'writeWithoutResponse', 'notify', 'indicate'

          descriptors: characteristicToCopy.descriptors, 

          onReadRequest: function(offset, callback) {
                    var peripheralId = this.peripheralId; 
                    var serviceUuid = this.serviceUuid;
                    var uuid = this.uuid;

                    var info = getServiceNames(serviceUuid, uuid);

                    debug('<< Read req : '.green + this.serviceUuid +' -> ' + this.uuid  + ' offset: ' + offset)

                    //we assume the original device read success
                    //todo? - forward possible error to client
                    var result=this.RESULT_SUCCESS;

                    if (hookTable[serviceUuid]) {
                     var hook = hookTable[serviceUuid][uuid];
                    }

                    if (hook) {
                      var hook = hookTable[serviceUuid][uuid];
                      if (hook.staticValue) {
                          var data = hook.staticValue;
                          console.log('<< Read static val '.green + info +' : ' + data.toString('hex').green.inverse + ' (' + utils.hex2a(data.toString('hex'))+ ')');
                          //return the static value
                          callback(result, new Buffer(data,'hex'));
                      } else if (hook.staticRead) {
                          hookFunctions[hook.staticRead](peripheralId, serviceUuid, uuid, 'read', null , wsclient, function(data){
                            callback(result, data);
                            console.log('<< Read static hook '.green + info +' : ' + data.toString('hex').green.inverse + ' (' + utils.hex2a(data.toString('hex'))+ ')');
                          })
                      } else if (hook.dynamicRead) {
                          wsclient.read(peripheralId, serviceUuid,uuid, function(data) {
                            console.log('<< Read for dynamic hook '.green + info + ' : ' + data.toString('hex').green.inverse + ' (' + utils.hex2a(data.toString('hex'))+ ')');
                            hookFunctions[hook.dynamicRead](peripheralId, serviceUuid, uuid, 'read', data, wsclient, function(err, modifiedData){
                               //if err...
                              callback(result, modifiedData);
                            })
                          })
                     }
                    } else { // no hook, just read directly from device
                        wsclient.read(peripheralId, serviceUuid, uuid, function(data) {
                          if (data) {
                           console.log('<< Read:   '.green + info + ' : ' + data.toString('hex').green.inverse + ' (' + utils.hex2a(data.toString('hex'))+ ')');
                           dumpLog('> R',peripheralId, serviceUuid, uuid, data);
                           callback(result, data);
                          }
                          else { //we did not receive the data (e.g. it was authenticated read and we have no bond with device)
                           console.log('<< Read DATA error '.red + info);
                           //should we inform the client or maybe deceive him?
                           callback(this.RESULT_FAILURE, null);
                          }
                        })
                    }

                    }, 

          onWriteRequest: function(data, offset, withoutResponse, callback) {
                    var peripheralId = this.peripheralId;
                    var serviceUuid = this.serviceUuid;
                    var uuid = this.uuid;

                    console.log('>> Write:  '.blue + getServiceNames(serviceUuid,uuid) + ' : '+ data.toString('hex').blue.inverse + ' (' + utils.hex2a(data.toString('hex'))+')');
                    if (withoutResponse) {
                      dumpLog('< W',peripheralId, serviceUuid, uuid, data);
                    } else {
                      dumpLog('< C',peripheralId, serviceUuid, uuid, data);                      
                    }

                    if (hookTable[serviceUuid]) {
                     var hook = hookTable[serviceUuid][uuid];
                    }

                    if (hook) {
                     if (hook.staticWrite) {
                          //send the write data to static hook function, do not forward the write to device
                          hookFunctions[hook.staticWrite](peripheralId, serviceUuid, uuid, 'write', data, wsclient, function(error, data){
                            console.log('>> Write static hook: '.green + data.toString('hex').green.inverse + ' (' + utils.hex2a(data.toString('hex'))+ ')');
                            callback(0x00);
                          })
                      } else if (hook.dynamicWrite) {
                          // invoke dynamic function, then forward returned data to device
                          hookFunctions[hook.dynamicWrite](peripheralId, serviceUuid, uuid, 'write', data, wsclient, function(err, modifiedData){
                            //todo if err...
                            if (modifiedData) { // if the dynamicWrite function returns null, do not forward anything to device
                                wsclient.write(peripheralId, serviceUuid,uuid, modifiedData, withoutResponse, function(error) {
                                  if (error){
                                    console.log('------ Write error: '.red);
                                    throw(error);
                                  } 
                                  callback(0x00);
                                });
                            } else {
                                console.log('    hook function did not return modified data');
                                callback(0x00);
                            }
                          })
                     } else {
                        //other hooks, but not for write
                        wsclient.write(peripheralId, serviceUuid, uuid, data, withoutResponse, function(error) {
                          if (error){
                            console.log('------ Write error: '.red);
                            throw(error);
                          } 
                          callback(0x00);
                        });                        
                     }
                    } else { // no hook, just write directly to device
                        wsclient.write(peripheralId, serviceUuid, uuid, data, withoutResponse, function(error) {
                          if (error){
                            console.log('------ Write error: '.red);
                            throw(error);
                          } 
                          callback(0x00);
                        });
                    }

                  },

          onSubscribe: function(maxValueSize, updateValueCallback) { // optional notify/indicate subscribe handler, function(maxValueSize, updateValueCallback) { ...}
                    var peripheralId = this.peripheralId;
                    var serviceUuid = this.serviceUuid;
                    var uuid = this.uuid;


                    if (servicesLookup[serviceUuid]) {
                      var serviceName = servicesLookup[serviceUuid].name;
                      var characteristicName = servicesLookup[serviceUuid].characteristics[uuid].name;      
                    }


                    var info = '>> Subscribe: '.blue + serviceUuid;
                    if (serviceName) { info += ' (' + serviceName + ')' };
                    info +=' -> ' + uuid;
                    if (characteristicName) { info += ' (' + characteristicName +' )' }

                    console.log(info);

                    if (! subscriptions[this.serviceUuid]) {
                      subscriptions[this.serviceUuid]=[];
                    } 
                    if (! subscriptions[this.serviceUuid][this.uuid]) {
                        subscriptions[this.serviceUuid][this.uuid]=updateValueCallback;
                    }

                    if (!staticRun) {

                    }
                    //send the subscription request to device
                    wsclient.notify(peripheralId, serviceUuid, uuid, true, function(err, service, characteristic, state) {
                        if (err) {
                              console.log('---------  SUBSCRIBE ERROR'.red);
                        }
                        else {
                          console.log('   ' + service + ':' + characteristic + ' confirmed subscription state: ' + state);
                        }
                   });

              },
          onUnsubscribe: function() { // optional notify/indicate unsubscribe handler, function() { ...}
              //  console.log('========== onUnsubscribe');
          }, 
          onNotify: function() {// optional notify sent handler, function() { ...}
               // console.log('========== onNotify');
          }, 
          onIndicate: function(updateValueCallback) { // optional indicate confirmation received handler, function() { ...}
                // console.log('========== onIndicate');

          }
      });

      mitmcharacteristic.peripheralId = peripheralId;
      mitmcharacteristics.push(mitmcharacteristic);
      }


    var primaryService = new PrimaryService({
        uuid: serviceToCopy.uuid, 
        name: serviceToCopy.name,
        startHandle: serviceToCopy.startHandle,
        endHandle: serviceToCopy.endHandle,
        type: serviceToCopy.type,
        characteristics: mitmcharacteristics
    });

      mitmservices.push(primaryService);

      servicesLookup[serviceToCopy.uuid].name = serviceToCopy.name;
      servicesLookup[serviceToCopy.uuid].type = serviceToCopy.type;

  }

  callback(mitmservices);

}



