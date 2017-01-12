var fs = require('fs');
var glob = require('glob');
var debug = require('debug')('utils')

//display only readable chars (ascii 31-127)
function hex2a(hex) {
  var str = '';
  if (hex){
    var hexstr = hex.toString('ascii');//force conversion
    for (var i = 0; i < hexstr.length; i += 2) {
        //we will display only readable chars
        var intChar = parseInt(hexstr.substr(i,2),16);
        if ((intChar > 31) & (intChar < 127)) {
          str += String.fromCharCode(intChar);
        }
        else {
          str += " ";
        }
    }
  }
  return str;
}

function printAdvertisement(peripheralId, address, addressType, connectable, advertisement, rssi, isRefreshed) {

  if (!isRefreshed) {
    console.log('peripheral discovered (' + peripheralId + 
                ' with address <' + address +  ', ' + addressType + '>,' +
                ' connectable ' + connectable + ',' +
                ' RSSI ' + rssi + ':');  
  } else {
    console.log('refreshed advertisement for ' + peripheralId + ' (' + advertisement.localName +')');
  }

  if (address.substring(0,8) === 'ec:fe:7e') {
    console.log('BlueRadios MAC address - check AT commands service by blueRadiosCmd script!'.red)
  }
  if (advertisement.localName) {
    console.log('\tName: ' + advertisement.localName);    
  }
  if (advertisement.eir){
    console.log('\tEIR: ' + advertisement.eir.toString('hex') + ' (' + hex2a(advertisement.eir.toString('hex'))+')');        
  }
  if (advertisement.scanResponse){
    console.log('\tScan response: ' + advertisement.scanResponse.toString('hex') + ' (' + hex2a(advertisement.scanResponse.toString('hex'))+')');        
  }
  console.log();  
}

function checkAdvertisement(peripheralId, advertisement, callback){

  var sameFound=false;
  var eirString = null;
  var scanResponseString = null;

  if (advertisement.eir) {
    eirString = advertisement.eir.toString('hex')
  }
  if (advertisement.scanResponse) {
    scanResponseString = advertisement.scanResponse.toString('hex');
  }

  glob("devices/"+peripheralId+"*.adv.json", {}, function (err, files) {

    if (files.length > 0) { //device previously advertised, check if the advertisement changed
      //check each file - rewrite to async 
      for (var i in files) {
        debug('checking file: ' + files[i]);
        //ugly sync - rewrite ;)
        var dataBuf = fs.readFileSync(files[i]);
          dataStr = dataBuf.toString('ascii');
          data = JSON.parse(dataStr);

          if ((eirString === data.eir) && (scanResponseString === data.scanResponse)) {
            debug(' -- same advertisement');
            sameFound=true;     
            callback('same');
          }
      }

      if (!sameFound) {
        debug(' -- refreshed advertisement');
        callback('refreshed')
      }

    } else { //not yet spotted
      callback('new');
    }

  })
}


function saveAdvertisement(peripheralId, address, addressType, connectable, advertisement, rssi) {

  checkAdvertisement(peripheralId, advertisement, function(newAdv){
    if (newAdv === 'same' ) {
      console.log('already saved advertisement for ' + peripheralId + ' (' + advertisement.localName +')');
      //no-op
      return
    } else {
        //keep buffers as hex strings (by default buffers stringify unreadable into json)
        advToJson = { 
                      id: peripheralId,
                      eir: advertisement.eir ? advertisement.eir.toString('hex') : '',
                      scanResponse: advertisement.scanResponse ? advertisement.scanResponse.toString('hex') : null,
                      decodedNonEditable : {
                        localName: advertisement.localName ? advertisement.localName : '',
                        manufacturerDataHex: advertisement.manufacturerData ? advertisement.manufacturerData.toString('hex') : null,
                        manufacturerDataAscii: advertisement.manufacturerData ? hex2a(advertisement.manufacturerData.toString('hex')) : null,
                        serviceData: advertisement.serviceData,
                        serviceUuids: advertisement.serviceUuids
                      }
                    }
        deviceNameToFile='';
        if (advertisement.localName) {
          deviceNameToFile = advertisement.localName.replace(/[^a-zA-Z0-9]+/g, "-");
        }

        if (newAdv === 'new') {
          printAdvertisement(peripheralId, address, addressType, connectable, advertisement, rssi ,false);
          fileName = 'devices/'+peripheralId+'_'+ deviceNameToFile +'.adv.json';
        } else {
          printAdvertisement(peripheralId, address, addressType, connectable, advertisement, rssi,true);

          var date=new Date();
          var year = date.getFullYear();
          var month = date.getMonth() + 1;
          month = (month < 10 ? "0" : "") + month;
          var day  = date.getDate();
          day = (day < 10 ? "0" : "") + day;
          var hour = date.getHours();
          hour = (hour < 10 ? "0" : "") + hour;
          var min  = date.getMinutes();
          min = (min < 10 ? "0" : "") + min;
          var sec  = date.getSeconds();
          sec = (sec < 10 ? "0" : "") + sec;

          fileName = 'devices/'+peripheralId+'_'+ deviceNameToFile +'.'+year+month+day+hour+min+sec+'.adv.json';
        }

        fs.writeFile(fileName, JSON.stringify(advToJson, null, 4), function(err) {
          if(err) {
              return console.log(err);
          }
          console.log("advertisement saved: "+ fileName );
        }); 

    }
  })

}



module.exports.hex2a=hex2a
module.exports.checkAdvertisement=checkAdvertisement;
module.exports.saveAdvertisement=saveAdvertisement;