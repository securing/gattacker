
require('env2')('config.env');

var events = require('events');
var debug = require('debug')('ws-slave');
var WebSocket = require('ws');
var async = require('async');
var util = require('util');
var colors = require('colors');
var noble = require('./lib/noble');
var utils = require('./lib/utils');

var port = 0xB1e;

var ws;
var wss;

var peripherals = {};
var servicesCache=[];

var localMacAddress='';

var targetPeripheralId='';
var keepTargetConnected=false;
var initialized=false;
var connected=false;
var isClientConnected=false;

var eventEmitter = new events.EventEmitter();

console.log('GATTacker ws-slave');
wss = new WebSocket.Server({
  port: port,
  perMessageDeflate: false 
});

wss.on('connection', function(ws_) {
    console.log('ws -> connection');

    ws = ws_;

    sendEvent({
      type: 'stateChange',
      state: noble.state
    });

    ws.on('message', onMessage);

    ws.on('close', function() {
      console.log('ws -> close');
      //stop keeping connection to target device
      if (targetPeripheralId) {
        deinitialize(targetPeripheralId, function(peripheralId){
          debug('deinitialized: ' + peripheralId);
        });
      }
      noble.stopScanning();
    });
});


//handle raw notifications
noble._bindings.on('handleNotify', onRawNotify);



function sendEvent(event) {
  var message = JSON.stringify(event);

  console.log('ws -> send: '.blue + message);

  var clients = wss.clients;

  for (var i = 0; i < clients.length; i++) {
    clients[i].send(message);
  }
}

noble.on('scanStop', function(){
  sendEvent({
      type: "stopScanning"    
  })
});

noble.on('scanStart', function(){
  sendEvent({
      type: "startScanning"    
  })
});


//check local MAC address
noble._bindings._hci.on('addressChange', function(address){
    debug('Local MAC: ' + address);
    localMacAddress = address;
})



var onMessage = function(message) {
  console.log('ws -> message: '.green + message);

  var command = JSON.parse(message);

  var action = command.action;

  var peripheralId = command.peripheralId;
  var serviceUuids = command.serviceUuids;
  var serviceUuid = command.serviceUuid;
  var characteristicUuids = command.characteristicUuids;
  var characteristicUuid = command.characteristicUuid;
  var data = command.data ? new Buffer(command.data, 'hex') : null;
  var withoutResponse = command.withoutResponse;
  var broadcast = command.broadcast;
  var notify = command.notify;
  var descriptorUuid = command.descriptorUuid;
  var handle = handle;

  var peripheral = peripherals[peripheralId];
  var service = null;
  var characteristic = null;
  var descriptor = null;

  if (peripheral && serviceUuid) {
      var service = servicesCache[peripheralId].services[serviceUuid];
      if (!service) {
        debug('service not found!'.red);
      } else {
        var characteristic = servicesCache[peripheralId].services[serviceUuid].characteristics[characteristicUuid];
        if (!characteristic) {
              debug('-- Characteristic not found : '.red + characteristicUuid + '\nservice object:\n\n' + util.inspect( service, {showHidden: false, depth: 2, colorize: true}));           
        }
      }
  }
  if (action === 'read') {
      readRaw(peripheralId, serviceUuid, characteristicUuid)
  } else if (action === 'write') {
      writeRaw(peripheralId, serviceUuid, characteristicUuid, data, withoutResponse);
  } else if (action === 'notify') {
      subscribeRaw(peripheralId, serviceUuid, characteristicUuid, notify);
  } else if (action === 'explore') {
            explore(peripheralId, command.readValues);
  } else if (action === 'initialize'){
    if (command.servicesJsonData) {
     initialize(peripheralId, command.servicesJsonData, command.keepConnected);
    } else {
     initializeWithoutServices(peripheralId);     
    }
  } else if (action === 'clientConnection') {
    clientConnection(command.clientAddress, command.state);
  } else if (action === 'macAddress') {
    sendEvent({
      type: 'macAddress',
      macAddress: localMacAddress
    });
  } else if (action === 'startScanning') {
    noble.startScanning(serviceUuids, command.allowDuplicates);
  } else if (action === 'stopScanning') {
    noble.stopScanning();
  } else if (action === 'connect') {
    peripheral.connect();
  } else if (action === 'disconnect') {
    peripheral.disconnect();
  } else if (action === 'updateRssi') {
    peripheral.updateRssi();
  } else if (action === 'discoverServices') {
    peripheral.discoverServices(command.uuids);
  } else if (action === 'discoverIncludedServices') {
    service.discoverIncludedServices(serviceUuids);
  } else if (action === 'discoverCharacteristics') {
    service.discoverCharacteristics(characteristicUuids);
  } else if (action === 'broadcast') {
    characteristic.broadcast(broadcast);
  } else if (action === 'discoverDescriptors') {
    characteristic.discoverDescriptors();
  } else if (action === 'readValue') {
    descriptor.readValue();
  } else if (action === 'writeValue') {
    descriptor.writeValue(data);
  } else if (action === 'readHandle') {
    peripheral.readHandle(handle);
  } else if (action === 'writeHandle') {
    peripheral.writeHandle(handle, data, withoutResponse);
  } 
};


function initializeWithoutServices(peripheralId) {

   //was previously initialized for other device
  if (targetPeripheralId && targetPeripheralId != peripheralId) {
    deinitialize(targetPeripheralId, function(){
      console.log('re-initialize for other device ');
    })
  }

  targetPeripheralId = peripheralId;

  sendEvent({
     type: 'initializeStatus',
     peripheralId: peripheralId,
     status: 'about to explore services'
  })

  explore(peripheralId, false, function(servicesJson){
    //give it a second to settle for reconnect after exploring, otherwise "unknown connection identifier"
    setTimeout(function() {
      peripherals[peripheralId].connect(function(error){
        if (error) {
          debug('Connect error! '.red + error)
          sendEvent({
             type: 'initializeStatus',
             peripheralId: peripheralId,
             status: 'connect error' + error
          })

        } else {
          sendEvent({
             type: 'initialized',
             peripheralId: peripheralId
          })     
        }
      })
    }, 1000);

  })
}


function initialize(peripheralId, servicesJson, keepConnected) {

  debug('Initialize JSON services for ' + peripheralId)

   sendEvent({
      type: 'initializeStatus',
      peripheralId: peripheralId,
      status: 'JSON services received'
   })

   //was previously initialized for other device
  if (targetPeripheralId && targetPeripheralId != peripheralId) {
    deinitialize(targetPeripheralId, function(){
      console.log('re-initialize for other device ');
    })
  }

  keepTargetConnected=keepConnected;

  targetPeripheralId = peripheralId;

  if (!servicesCache[peripheralId]) {
    servicesCache[peripheralId] = { 
      services : [], 
      handles  : []
    }
  }

  //parse JSON to servicesCache array, indexed by uuids
  for (sindex = 0; sindex < servicesJson.length; ++sindex) {
    service = servicesJson[sindex];
    if (!servicesCache[peripheralId].services[service.uuid]) {
      servicesCache[peripheralId].services[service.uuid] = { characteristics : []};
    }
    debug("Setting up service: " + service.uuid);
    for (cindex = 0; cindex<service.characteristics.length; ++cindex) {
        characteristic = service.characteristics[cindex];

        debug("   Setting up Characteristic: " + characteristic.uuid);
        debug("    Handle: " + characteristic.valueHandle);
        debug("    Properties: " + characteristic.properties);

        servicesCache[peripheralId].services[service.uuid].characteristics[characteristic.uuid]= {
          handle: characteristic.valueHandle,
          properties : characteristic.properties,
          descriptors : []
        };
        //store handle association for quick raw notifications lookup
        servicesCache[peripheralId].handles[characteristic.valueHandle] = {
          serviceUuid : service.uuid,
          uuid        : characteristic.uuid
        }

        if (characteristic.descriptors.length > 0) { 
          debug("      Descriptors: "); 
          for (dindex = 0; dindex < characteristic.descriptors.length; ++dindex) {
            descriptor = characteristic.descriptors[dindex];
            debug("         " + descriptor.uuid + ' handle ' + descriptor.handle)
            servicesCache[peripheralId].services[service.uuid].characteristics[characteristic.uuid].descriptors[descriptor.uuid]=descriptor.handle;
          }
        }
    }
  }  

  if (!peripherals[peripheralId]) {
    debug('Peripheral not yet discovered, start scanning...')
    sendEvent({
      type: 'initializeStatus',
      peripheralId: peripheralId,     
      status: 'start scanning for target peripheral'
    })
    noble.startScanning();

    eventEmitter.once('targetDiscovered', function(){
      noble.stopScanning();
      sendEvent({
        type: 'initializeStatus',
        peripheralId: peripheralId,
        status: 'target peripheral discovered, trying to connect...'
      })
      //connect to target peripheral
      peripherals[peripheralId].connect(function(error){
        if (error) {
          sendEvent({
             type: 'initializeStatus',
             peripheralId: peripheralId,
             status: 'connect error'
          });        
        } else {
          sendEvent({
             type: 'initialized',
             peripheralId: peripheralId
          });                  
        }
      })
    })
  } else { //previously discovered
      sendEvent({
        type: 'initializeStatus',
        peripheralId: peripheralId,
        status: 'target peripheral previously discovered, trying to connect...'
      })

      //connect to target peripheral
      peripherals[peripheralId].connect(function(error){
        if (error) {
          sendEvent({
             type: 'initializeStatus',
             peripheralId: peripheralId,
             status: 'connect error'
          });        
        } else {
          sendEvent({
             type: 'initialized',
             peripheralId: peripheralId
          });                  
        }
      })
  }
}

//read by handle
function readRaw(peripheralId, serviceUuid, uuid, callback){
  //todo catch exceptions
  var handle = servicesCache[peripheralId].services[serviceUuid].characteristics[uuid].handle;
  var peripheral = peripherals[peripheralId];

  //if not connected, connect
  checkConnected(peripheral, function(){
    peripheral.readHandle(handle, function(error, data){
      if (error) {
        debug('readHandle error : '.red + error)
      }
      debug('read handle data :' + data.toString('hex'));

      sendEvent({
          type: 'read',
          peripheralId: peripheralId,
          serviceUuid: serviceUuid,
          characteristicUuid: uuid,
          data: data.toString('hex'),
          isNotification: false
      });

      if (callback) { callback(error, data); }
    });
  })
}

//write by handle
function writeRaw(peripheralId, serviceUuid, uuid, data, withoutResponse, callback){
  //todo catch exceptions
  var handle = servicesCache[peripheralId].services[serviceUuid].characteristics[uuid].handle;
  var peripheral = peripherals[peripheralId];

  //if not connected, connect
  checkConnected(peripheral, function(){
    peripheral.writeHandle(handle, new Buffer(data,'hex'), withoutResponse, function(error){
      if (error) {
        debug('Write handle error! '. red + error);
      }
      debug('write handle sent ' + peripheralId + ' : ' + serviceUuid + ' : ' + uuid )
      sendEvent({
         type: 'write',
         peripheralId: peripheralId,
         serviceUuid: serviceUuid,
         characteristicUuid: uuid
      });

    });
  })
}

//raw subscription to indication/notification
function subscribeRaw(peripheralId, serviceUuid, uuid, state, callback) {

  //todo catch exceptions
  var peripheral = peripherals[peripheralId];
  var characteristic = servicesCache[peripheralId].services[serviceUuid].characteristics[uuid];
  var handle = characteristic.descriptors['2902'];

  if (state == false) {
    value = '0000';
  } else {
    if (characteristic.properties == 'indicate'){
      value = '0200';
    } else  {// notify
      value = '0100';
    }    
  }

  //if not connected, connect
  checkConnected(peripheral, function(){
    peripheral.writeHandle(handle, new Buffer(value, 'hex'), false, function(error){
      if (error){
        debug('Subscribe error '.red + peripheralId + ' : ' + serviceUuid + ' : ' + uuid )
      }
      sendEvent({
        type: 'notify',
        peripheralId: peripheralId,
        serviceUuid: serviceUuid,
        characteristicUuid: uuid,
        state: state
      });
    });
  })

  checkRawNotificationListeners();
}

//Debug
function checkRawNotificationListeners() {

  listenersCount=noble._bindings.listeners('handleNotify').length;
 // debug('Raw notification listeners: ' + util.inspect(noble._bindings.listeners('handleNotify')));
  if (!listenersCount) {
    noble._bindings.on('handleNotify', onRawNotify);    
  }
}




function onRawNotify(peripheralId, handle, data){
  //todo catch exceptions
  var serviceUuid = servicesCache[peripheralId].handles[handle].serviceUuid;
  var uuid = servicesCache[peripheralId].handles[handle].uuid;

  debug('Raw notify: ' + peripheralId + ' : ' + handle + ' : ' + data.toString('hex'));

   sendEvent({
      type: 'read',
      peripheralId: peripheralId,
      serviceUuid: serviceUuid,
      characteristicUuid: uuid,
      data: data.toString('hex'),
      isNotification: true
   });
}

function deinitialize(peripheralId, callback){ 
  targetPeripheralId='';
  initialized=false;
  if (peripherals[peripheralId]) {
    if (peripherals[peripheralId].connected) {
      debug('disconnecting peripheral');
      peripherals[peripheralId].disconnect();
    }
  }
  if (callback) {
    callback(peripheralId);
  }
}


function clientConnection(clientAddress, state) {
  var dis = '';
  if (state != true) {
    dis='dis';
  }
  console.log('client ' + dis + 'connected : ' + clientAddress);
  isClientConnected = state;
  // send confirmation event for reconnect
  eventEmitter.emit('clientConnection', clientAddress, state);

}

//check whether connected to peripheral, if not - reconnect, and then invoke peripheral function
function checkConnected(peripheral, callback){
  if (peripheral.state === 'connected') {
    debug(' - connected');
    if (callback) { callback(); }
  } else if (peripheral.state === 'connecting'){
    debug(' - connecting....');
    //wait until the connection completes, invoke callback    
    peripheral.once('connect', function(){
      if (callback){
        callback();
      }
    }) 
  } 
  else { //not connected
    debug(' - not connected');
    //if peripheral is lost by noble
    if (! noble._peripherals[peripheral.id]) {
        console.log('No such peripheral! This should not happen, restart manually...');
        return
    }

    peripheral.connect( function(error) {
        if (error) {
          debug('checkconnected -> reconnect error !'.red + error)
        } else {
          debug('checkconnected -> reconnect');          
        }
        if (callback) { callback(error); };
    });
  } 
}

noble.on('discover', function(peripheral) {

  var alreadyDiscovered=false;

  if (peripherals[peripheral.id]) {
    alreadyDiscovered=true;
  }

  peripherals[peripheral.id] = peripheral;

  debug('DISCOVER: '+ peripheral.id + ', target: ' + targetPeripheralId)

  if ((peripheral.id === targetPeripheralId)) {
    eventEmitter.emit('targetDiscovered');
  } 

  sendEvent({
    type: 'discover',
    peripheralId: peripheral.id,
    address: peripheral.address,
    addressType: peripheral.addressType,
    connectable: peripheral.connectable,
    advertisement: {
      localName: peripheral.advertisement.localName,
      txPowerLevel: peripheral.advertisement.txPowerLevel,
      serviceUuids: peripheral.advertisement.serviceUuids,
      manufacturerData: (peripheral.advertisement.manufacturerData ? peripheral.advertisement.manufacturerData.toString('hex') : null),
      //todo convert object to array
      serviceData: (peripheral.advertisement.serviceData ? peripheral.advertisement.serviceData.toString('hex') : null),
      eir: (peripheral.advertisement.eir ? peripheral.advertisement.eir.toString('hex') : null),
      scanResponse: (peripheral.advertisement.scanResponse ? peripheral.advertisement.scanResponse.toString('hex') : null)
    },
    rssi: peripheral.rssi
  });


  if (alreadyDiscovered) {
    //return - we do not need to setup the event listeners again
    return
  }


  peripheral.on('connect', function() {
    sendEvent({
      type: 'connect',
      peripheralId: this.uuid
    });
  });


  peripheral.on('disconnect', function() {
    sendEvent({
      type: 'disconnect',
      peripheralId: this.uuid
    });

    for (var i in this.services) {
      for (var j in this.services[i].characteristics) {
        for (var k in this.services[i].characteristics[j].descriptors) {
          this.services[i].characteristics[j].descriptors[k].removeAllListeners();
        }

        this.services[i].characteristics[j].removeAllListeners();
      }
      this.services[i].removeAllListeners();
    }

    this.removeAllListeners();

    if (keepTargetConnected) {
      debug('Keep connected ')
      if (!isClientConnected) {
       // we wait here for the targeted mobile phone to connect to bleno-cloned device
       // otherwise we will most probably connect to ourselves 
       // TODO: as an option, it will not be a problem if remote or different MAC
         sendEvent({
             type: 'initializeStatus',
             peripheralId: peripheral.id,
             status: 'waiting with reconnect to target device for client connection to bleno...'
         }); 

         if (! eventEmitter.listeners('clientConnected').length) {
           eventEmitter.once('clientConnected', function(){
               sendEvent({
                   type: 'initializeStatus',
                   peripheralId: peripheral.id,
                   status: 'client connection to bleno, reconnecting to target device'
               });                       
               checkConnected(peripheral);
           })         
         }        
      } else {
          debug('reconnect');
          checkConnected(peripheral);
      }
    }
  }); //on disconnect


  peripheral.on('rssiUpdate', function(rssi) {
    sendEvent({
      type: 'rssiUpdate',
      peripheralId: this.uuid,
      rssi: rssi
    });
  });

  peripheral.on('servicesDiscover', function(services) {

    debug('--- on servicesDiscover');
    var peripheral = this;
    var exportServices = [];

    var includedServicesDiscover = function(includedServiceUuids) {
      sendEvent({
        type: 'includedServicesDiscover',
        peripheralId: peripheral.id,
        serviceUuid: this.uuid,
        includedServiceUuids: includedServiceUuids
      });
    };

    var characteristicsDiscover = function(characteristics) {
      var service = this;
      var discoveredCharacteristics = [];

      var read = function(data, isNotification) {
        var characteristic = this;

        sendEvent({
          type: 'read',
          peripheralId: peripheral.id,
          serviceUuid: service.uuid,
          characteristicUuid: characteristic.uuid,
          data: data.toString('hex'),
          isNotification: isNotification
        });
      };

      var write = function() {
        var characteristic = this;

        sendEvent({
          type: 'write',
          peripheralId: peripheral.id,
          serviceUuid: service.uuid,
          characteristicUuid: characteristic.uuid
        });
      };

      var broadcast = function(state) {
        var characteristic = this;

        sendEvent({
          type: 'broadcast',
          peripheralId: peripheral.id,
          serviceUuid: service.uuid,
          characteristicUuid: characteristic.uuid,
          state: state
        });
      };

      var notify = function(state) {
        var characteristic = this;

        sendEvent({
          type: 'notify',
          peripheralId: peripheral.id,
          serviceUuid: service.uuid,
          characteristicUuid: characteristic.uuid,
          state: state
        });
      };

      var descriptorsDiscover = function(descriptors) {
        var characteristic = this;

        var discoveredDescriptors = [];

        var valueRead = function(data) {
          var descriptor = this;

          sendEvent({
            type: 'valueRead',
            peripheralId: peripheral.id,
            serviceUuid: service.uuid,
            characteristicUuid: characteristic.uuid,
            descriptorUuid: descriptor.uuid,
            data: data.toString('hex')
          });
        };

        var valueWrite = function(data) {
          var descriptor = this;

          sendEvent({
            type: 'valueWrite',
            peripheralId: peripheral.id,
            serviceUuid: service.uuid,
            characteristicUuid: characteristic.uuid,
            descriptorUuid: descriptor.uuid
          });
        };

        //have to get it from _gatts, only there is handle number stored
        var rawDescriptors = peripheral._noble._bindings._gatts[peripheral.id]._descriptors[service.uuid][characteristic.uuid];

        for (var k in descriptors) {

          var descriptorValue='';
          var descriptorUuid = descriptors[k].uuid;
          descriptors[k].on('valueRead', valueRead);
          descriptors[k].on('valueWrite', valueWrite);

          var exportDescriptor = {
              handle: rawDescriptors[descriptorUuid].handle,
              uuid: descriptorUuid,
          }
          discoveredDescriptors.push(exportDescriptor);
        }

        sendEvent({
          type: 'descriptorsDiscover',
          peripheralId: peripheral.id,
          serviceUuid: service.uuid,
          characteristicUuid: this.uuid,
          descriptors: discoveredDescriptors
        });
      };

      for (var j = 0; j < characteristics.length; j++) {
        var characteristic = characteristics[j];
        characteristic.on('read', read);
        characteristic.on('write', write);
        characteristic.on('broadcast', broadcast);
        characteristic.on('notify', notify);
        characteristic.on('descriptorsDiscover', descriptorsDiscover);

        discoveredCharacteristics.push({
          uuid: characteristic.uuid,
          name: characteristic.name,
          properties: characteristic.properties,
          //we have to get it from internal noble _gatts objects
          startHandle : peripheral._noble._bindings._gatts[peripheral.id]._characteristics[service.uuid][characteristic.uuid].startHandle,         
          valueHandle : peripheral._noble._bindings._gatts[peripheral.id]._characteristics[service.uuid][characteristic.uuid].valueHandle,
          endHandle : peripheral._noble._bindings._gatts[peripheral.id]._characteristics[service.uuid][characteristic.uuid].endHandle
        });
      }

      sendEvent({
        type: 'characteristicsDiscover',
        peripheralId: peripheral.id,
        serviceUuid: this.uuid,
        characteristics: discoveredCharacteristics
      });
    };

    for (var i in services) {
      service=services[i];
      service.on('includedServicesDiscover', includedServicesDiscover);
      service.on('characteristicsDiscover', characteristicsDiscover);
      var exportService = { 
            uuid: service.uuid,
            name: service.name,
            type: service.type,
            //we have to get handle numbers from _gatts
            startHandle: peripheral._noble._bindings._gatts[peripheral.id]._services[service.uuid].startHandle,
            endHandle: peripheral._noble._bindings._gatts[peripheral.id]._services[service.uuid].endHandle,
      };

      exportServices.push(exportService);

    }

    sendEvent({
      type: 'servicesDiscover',
      peripheralId: this.uuid,
      services: exportServices
    });
  });

  peripheral.on('handleRead', function(handle, data) {
    sendEvent({
      type: 'handleRead',
      peripheralId: this.uuid,
      handle: handle,
      data: data.toString('hex')
    });
  });

  peripheral.on('handleWrite', function(handle) {
    sendEvent({
      type: 'handleWrite',
      peripheralId: this.uuid,
      handle: handle
    });
  });


});


function explore(peripheralId, readValues, callback) {

  var peripheral=peripherals[peripheralId];

/*
   //was previously initialized for other device
  if (targetPeripheralId && targetPeripheralId != peripheralId) {
    deinitialize(targetPeripheralId, function(){
      console.log('re-initialize for other device ');
    })
  }

  targetPeripheralId = peripheralId;
*/

  if (!peripheral) {
    sendEvent({
      type:'explore',
      peripheralId: peripheralId,
      state: 'startScan'
    })

    targetPeripheralId = peripheralId;

    noble.startScanning();

    eventEmitter.once('targetDiscovered', function(){
      noble.stopScanning();
      sendEvent({
        type: 'explore',
        peripheralId: peripheralId,
        state: 'discovered'
      })

      exploreServices(peripherals[peripheralId], readValues, callback);
    })
  } else {
      exploreServices(peripherals[peripheralId], readValues, callback);
  }  
}

function exploreServices(peripheral, readValues, callback) {

  var exportServices=[];
  var peripheralId = peripheral.id;


  sendEvent({
    type:'explore',
    peripheralId: peripheral.id,
    state: 'start'
  })

  peripheral.connect( function(error) {

    if (error){
      console.log('Explore: connect error: '.red + error + ' - try hciconfig reset...');
    }
    peripheral.discoverServices([], function(error, services) {
      debug('Explore: discoverServices');

      var serviceIndex = 0;


      if (!servicesCache[peripheralId]) {
        servicesCache[peripheralId] = { 
          services : [], 
          handles  : []
        }
      }

      async.whilst(
        function () {
          return (serviceIndex < services.length);
        },
        function(callback) {
          var service = services[serviceIndex];
          var serviceInfo = service.uuid;
          var exportService = { 
              uuid: service.uuid,
              name: service.name,
              type: service.type,
              startHandle: peripheral._noble._bindings._gatts[peripheral.id]._services[service.uuid].startHandle,
              endHandle: peripheral._noble._bindings._gatts[peripheral.id]._services[service.uuid].endHandle,
              characteristics: []
          };

          if (service.name) {
            serviceInfo += ' (' + service.name + ')';
          }
          debug(serviceInfo);

          if (!servicesCache[peripheralId].services[service.uuid]) {
            servicesCache[peripheralId].services[service.uuid] = { characteristics : []};
          }

          service.discoverCharacteristics([], function(error, characteristics) {
            var characteristicIndex = 0;
            var userDescriptorValue='';

            async.whilst(
              function () {
                return (characteristicIndex < characteristics.length);
              },
              function(callback) {
                var characteristic = characteristics[characteristicIndex];
                var exportCharacteristic = {uuid: characteristic.uuid, name: characteristic.name, properties: characteristic.properties, value: "", descriptors: []};
                var characteristicInfo = '  ' + characteristic.uuid;

                servicesCache[peripheralId].services[service.uuid].characteristics[characteristic.uuid]= {
                  properties : characteristic.properties,
                  descriptors : []
                };

                if (characteristic.name) {
                  characteristicInfo += ' (' + characteristic.name + ')';
                }

                async.series([
                  //get the descriptors, fill 2901 (user descriptor) value
                  function(callback) {
                    characteristic.discoverDescriptors(function(error, descriptors) {
                      async.detect(
                        descriptors,
                        function(descriptor, callback) {
                          return callback(null, descriptor.uuid === '2901');
                        },
                        function(error, userDescriptionDescriptor){
                          if (userDescriptionDescriptor && readValues) {
                            userDescriptionDescriptor.readValue(function(error, data) {
                              if (data) {
                                userDescriptorValue=data.toString();
//                                debug(' Descriptor value: '+ userDescriptorValue);
                                characteristicInfo += ' (' + userDescriptorValue + ')';
                              } else userDescriptorValue='';
                              callback();
                            });
                          } else {
                            callback();
                          }
                        }
                      );
                    });
                  },

                  function(callback){
                      var descriptorIndex = 0;
                      var exportDescriptor;  


                        //have to get it from _gatts, only there is handle # stored
                        var rawDescriptors = peripheral._noble._bindings._gatts[peripheral.id]._descriptors[service.uuid][characteristic.uuid];
                        var descriptorValue = '';

                        for (var descriptorUuid in rawDescriptors) {

                          servicesCache[peripheralId].services[service.uuid].characteristics[characteristic.uuid].descriptors[descriptorUuid]=rawDescriptors[descriptorUuid].handle;

                          //get value of user description
                          if (descriptorUuid === '2901') {
                            //from previous async series function
                            descriptorValue = userDescriptorValue;
                          } 
//                          else if (descriptorUuid === '2902') {
//              2902 - bit 0 = notifications: enabled/disabled, bit 1 = indications enabled/disabled
//                     it may be helpful after reconnect
//                            descriptorValue = '';
//                          }
                          else descriptorValue='';

                          exportDescriptor = {
                            handle: rawDescriptors[descriptorUuid].handle,
                            uuid: rawDescriptors[descriptorUuid].uuid,
                            value: descriptorValue
                          }
                          //debug('DESCRIPT : ' + util.inspect(exportDescriptor, {showHidden: false, depth: null}));
                          characteristicInfo += '\n       Descriptor: ' + exportDescriptor;
                          exportCharacteristic.descriptors.push(exportDescriptor);
                        }
                        callback();

                  },
                  function(callback) {
                        characteristicInfo += '\n    properties  ' + characteristic.properties.join(', ');

                        exportCharacteristic.startHandle = peripheral._noble._bindings._gatts[peripheral.id]._characteristics[service.uuid][characteristic.uuid].startHandle;
                        exportCharacteristic.valueHandle = peripheral._noble._bindings._gatts[peripheral.id]._characteristics[service.uuid][characteristic.uuid].valueHandle;
                        characteristicInfo += '\n     HANDLE: ' + exportCharacteristic.valueHandle;

                        servicesCache[peripheralId].services[service.uuid].characteristics[characteristic.uuid].handle = exportCharacteristic.valueHandle;
                        servicesCache[peripheralId].handles[exportCharacteristic.valueHandle] = {
                          serviceUuid : service.uuid,
                          uuid        : characteristic.uuid
                        }

                    if ( (characteristic.properties.indexOf('read') !== -1) && readValues ) {
                      characteristic.read(function(error, data) {
                        if (data) {
                          var hexValue = data.toString('hex');
                          var asciiValue = utils.hex2a(hexValue);
                          exportCharacteristic.value=hexValue;
                          exportCharacteristic.asciiValue=asciiValue;

                          characteristicInfo += '\n    value       ' + hexValue + ' | \'' + asciiValue + '\'';
                        }
                        callback();
                      });
                    } else {
                      callback();
                    }
                  },
                  function() {
                    debug(characteristicInfo);
                    exportService.characteristics.push(exportCharacteristic);
                    characteristicIndex++;
                    callback();
                  }
                ]);
              },
              function(error) {
                exportServices.push(exportService);
                serviceIndex++;
                callback();
              }
            );
          });
        },
        function (err) {

            sendEvent({
              type:'explore',
              peripheralId: peripheral.id,
              state: 'finished',
              servicesJsonData : exportServices
            })

          //todo - as an option, not always desirable
          peripheral.disconnect();

          if (callback){
            callback(exportServices);
          }

        }
      );
    });
  });
}

