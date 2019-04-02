require('env2')('config.env');

var events = require('events');
var util = require('util');
var async = require('async');
var WebSocket = require('ws');
var colors = require('colors');
var debug = require('debug')('ws-client')

var port = 0xB1e;

var slaveAddress=process.env.WS_SLAVE;
var wsDebug=process.env.WS_DEBUG;

var myAddress='';

var wsClient = function(){

  console.log('Ws-slave address: ' + slaveAddress);

  this.on('read', this.onRead);
  events.EventEmitter.call(this);

  ws = new WebSocket('ws://'+slaveAddress+':'+port);
  if (!ws.on) {
        ws.on = ws.addEventListener;
  }

  ws.on('message', this.onMessage.bind(this));

  var _this = this;
  ws.on('open', function() {
     // ws.send('something');
     console.log('on open');
     _this.emit('ws_open');
  });

}

util.inherits(wsClient, events.EventEmitter);

wsClient.prototype.checkReadyState = function(callback){

 switch (ws.readyState) {
  case WebSocket.CONNECTING:
    console.log('connecting');
    break;
  case WebSocket.OPEN:
    console.log('connecting');
    break;
  case WebSocket.CLOSING:
    console.log('closing');
    break;
  case WebSocket.CLOSED:
    console.log('closed');
    break;
  default:
    break;
  }
  callback(ws.readyState);

}

wsClient.prototype.sendAction = function(action) {
  var message = JSON.stringify(action);
  ws.send(message);
  if (wsDebug == 1) {
    console.log('[> WS send ] : '.grey + message);   
  }
}

wsClient.prototype.onMessage = function(rawmessage) {

  if (wsDebug == 1) {
    console.log('[< WS rec  ] %s'.grey, rawmessage);
  }

  var message = JSON.parse(rawmessage);

  var type = message.type;
  var peripheralId = message.peripheralId;
  var address = message.address;
  var addressType = message.addressType;
  var connectable = message.connectable;
  var advertisement = message.advertisement;
  var rssi = message.rssi;
  var services = message.services;

  var serviceUuid = message.serviceUuid;
  var includedServiceUuids = message.includedServiceUuids;
  var characteristics = message.characteristics;
  var characteristicUuid = message.characteristicUuid;
  var data = message.data ? new Buffer(message.data, 'hex') : null;
  var isNotification = message.isNotification;
  var state = message.state;
  var descriptors = message.descriptors;
  var descriptorUuid = message.descriptorUuid;
  var handle = message.handle;

  if (type === 'stateChange') {
    console.log(state);
    this.emit('stateChange', state);
  } else if (type === 'discover') {

    advertisement = {
      localName: advertisement.localName,
      txPowerLevel: advertisement.txPowerLevel,
      serviceUuids: advertisement.serviceUuids,
      manufacturerData: (advertisement.manufacturerData ? new Buffer(advertisement.manufacturerData, 'hex') : null),
      // todo transform unreadable objects 
     // serviceData: (advertisement.serviceData ? new Buffer(advertisement.serviceData, 'hex') : null)
     // serviceData: new Buffer(serviceDataFromEvent, 'hex')
      eir: (advertisement.eir ? new Buffer(advertisement.eir, 'hex') : null),
      scanResponse: (advertisement.scanResponse ? new Buffer(advertisement.scanResponse, 'hex') : null),
    };

    this.emit('discover', peripheralId, address, addressType, connectable, advertisement, rssi);

  } else if (type === 'initialized') {
    this.emit('initialized', peripheralId);
  } else if (type === 'explore') {
    this.emit('explore', peripheralId, state, message.servicesJsonData);
  } else if (type === 'clientConnection') {
    this.emit('clientConnection', message.clientAddress, state);
  } else if (type === 'macAddress') {
    myAddress = message.macAddress;
    this.emit('macAddress', message.macAddress);
  } else if (type === 'connect') {
    this.emit('connect', peripheralId);
  } else if (type === 'disconnect') {
    this.emit('disconnect', peripheralId);
  } else if (type === 'rssiUpdate') {
    this.emit('rssiUpdate', peripheralId, rssi);
  } else if (type === 'servicesDiscover') {
    this.emit('servicesDiscover', peripheralId, services);
  } else if (type === 'includedServicesDiscover') {
    this.emit('includedServicesDiscover', peripheralId, serviceUuid, includedServiceUuids);
  } else if (type === 'characteristicsDiscover') {
    this.emit('characteristicsDiscover', peripheralId, serviceUuid, characteristics);
  } else if (type === 'read') {
    this.emit('read', peripheralId, serviceUuid, characteristicUuid, data, isNotification);
  } else if (type === 'write') {
    this.emit('write', peripheralId, serviceUuid, characteristicUuid);
  } else if (type === 'broadcast') {
    this.emit('broadcast', serviceUuid, characteristicUuid, state);
  } else if (type === 'notify') {
    this.emit('notify', peripheralId, serviceUuid, characteristicUuid, state);
  } else if (type === 'descriptorsDiscover') {
    this.emit('descriptorsDiscover', peripheralId, serviceUuid, characteristicUuid, descriptors);
  } else if (type === 'valueRead') {
    this.emit('valueRead', peripheralId, serviceUuid, characteristicUuid, descriptorUuid, data);
  } else if (type === 'valueWrite') {
    this.emit('valueWrite', peripheralId, serviceUuid, characteristicUuid, descriptorUuid);
  } else if (type === 'handleRead') {
    this.emit('handleRead', handle, data);
  } else if (type === 'handleWrite') {
    this.emit('handleWrite', handle);
  } else if (type === 'handleNotify') {
    this.emit('handleNotify', handle, data);
  }

};

wsClient.prototype.sendServicesJson = function(peripheralId, data, callback){

  this.sendAction({
    action : 'servicesJson',
    peripheralId : peripheralId,
    servicesJsonData : data
  })

  if (callback){
    //todo ws.once('...')
  }
}

wsClient.prototype.startScanning = function(){
  this.sendAction({
    action : 'startScanning'
  })
}

wsClient.prototype.stopScanning = function(){
  this.sendAction({
    action : 'stopScanning'
  })
}


wsClient.prototype.connect = function(peripheralId){
  this.sendAction({
    action : 'connect',
    peripheralId : peripheralId
  })
}


wsClient.prototype.onRead = function(peripheralId, service, characteristic, data, isNotification) {
//  debug('onRead: ' + service + ' : ' + characteristic + ' : ' + data + ' : ' + isNotification);
  if (isNotification) {
    this.emit('notification', peripheralId, service, characteristic, data);
  }
}

wsClient.prototype.initialize = function(peripheralId, servicesJson, keepConnected, callback) {

  this.sendAction({
    action : 'initialize',
    peripheralId : peripheralId,
    servicesJsonData : servicesJson,
    keepConnected : keepConnected
  })

  //get mac address of noble 
  this.sendAction({
    action : 'macAddress'
  })

  if (callback){
    this.once('initialized', function(){ 
      callback(null);
    })
  }
}

wsClient.prototype.clientConnection = function(clientAddress, state){
    this.sendAction({
    action : 'clientConnection',
    clientAddress: clientAddress,
    state : state
  })
}


wsClient.prototype.read = function(peripheralId, serviceUuid, characteristicUuid, callback) {

  if (callback) {
    //todo - what if there was another read in the meantime ;)
    this.once('read', function(peripheralId, service, characteristic, data, isNotification) {
      debug("READ: " + service + "("+serviceUuid+") : " + characteristic + "("+characteristicUuid+") : " + data + " : " + isNotification);
      callback(data);
    });
  }
  this.sendAction({
    action : 'read',
    peripheralId : peripheralId,
    serviceUuid : serviceUuid,
    characteristicUuid : characteristicUuid
  })
}

wsClient.prototype.write = function(peripheralId, serviceUuid, characteristicUuid, data, withoutResponse, callback) {
  if (callback) {
    //todo err
    this.once('write', function(peripheral, service, characteristic) {
      if ((peripheral === peripheralId) && (service === serviceUuid) &&  (characteristic === characteristicUuid)) {
        debug("WRITE: " + service + "("+serviceUuid+") : " + characteristic + "("+characteristicUuid+")");
        callback(null);        
      }
    });
  }

  this.sendAction({
    action : 'write',
    peripheralId : peripheralId,
    serviceUuid : serviceUuid,
    characteristicUuid : characteristicUuid,
    data : data.toString('hex'),
    withoutResponse : withoutResponse
  })
}

//subscribe to notifications
wsClient.prototype.notify = function(peripheralId, serviceUuid, characteristicUuid, state, callback) {
  if (callback) {
    //todo err
    this.once('notify', function(peripheralId, service, characteristic, state) {
      debug("NOTIFY SUBSCRIBE: " + service + " : " + characteristic + ' : ' + state);
      //todo handle err
      callback(null, peripheralId, service, characteristic, state);
    });
  }
  this.sendAction({
    action : 'notify',
    peripheralId : peripheralId,
    serviceUuid : serviceUuid,
    characteristicUuid : characteristicUuid,
    notify : state
  })
}

wsClient.prototype.explore = function(peripheralId, readValues, callback) {

  this.sendAction({
    action : 'explore',
    peripheralId : peripheralId,
    readValues : readValues
  })

  if (callback) {
    this.once('explore')
  }
}


wsClient.prototype.getMac = function(callback) {
  if (!myAddress) {
      this.sendAction({
        action : 'macAddress'
      })

      this.once('macAddress', function(address){
        callback(address)
      })
  } else {
    callback(myAddress)    
  }
}

module.exports = new wsClient();
