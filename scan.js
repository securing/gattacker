require('env2')('config.env');

var wsclient = require('./lib/ws-client');
var fs = require('fs');
var utils = require('./lib/utils')
var events = require('events')
var util = require('util');
var async = require('async');
var fs = require('fs');
var debug = require('debug')('explore');
var getopt = require('node-getopt');

var options = new getopt([
  ['a' , 'no-advertisements'   , 'do not save advertisements (default: save)'],
  ['r' , 'no-read'             , 'do not read characteristics values (default: read), helpful when device requires auth and service exploring stalls'],
  ['o' , 'overwrite'           , 'overwrite peripheral services file'],
  ['f' , 'funmode'             , 'have fun!'], 
  [''  , 'jk'                  , 'see http://xkcd.com/1692'],
  ['h' , 'help'                , 'display this help'],
]);
options.setHelp('Usage: node scan [ -a ] [ -r ] [ peripheral ]\n' +
'peripheral - optional peripheral device do explore services (MAC address e.g. ec:fe:7e:12:34:56 or id e.g. ecfe7e123456). If not provided, broadcast advertisement scan.' +
'Command-line options:\n[[OPTIONS]]' )

opt=options.parseSystem();

if (opt.options.help) {
  options.showHelp()
  process.exit(0)
}

if (opt.options.funmode) {
  console.log('>>>>>>>>>>>>>>>>> MAY THE FUN BE WITH YOU! <<<<<<<<<<<<<<<<<<'.rainbow.inverse)
}

if (opt.argv.length > 0) {
  var specifiedPeripheral = opt.argv[0].replace(/:/g,'').toLowerCase();
}

var devicesPath=process.env.DEVICES_PATH;
var scanOrExplore = '';
var peripherals=[];
var saveAdvertisements=true;
var readValues=true;
var overWriteServices=false;

if (opt.options["no-advertisements"]) {
    console.log('Not saving advertisement discovery because the -a flag was set.'.red.bold);
    saveAdvertisements=false;
}

if (opt.options["no-read"]) {
    console.log('Not reading characteristic values.'.red.bold)
    readValues=false;
}

if (opt.options.overwrite) {
    console.log('Overwrite services file if exists.'.red.bold);
    overWriteServices=true;
}


function exploreSpecified(peripheralId) {

  checkFile(peripheralId, function(exists){
    if (!exists) {
        console.log('[+]'.green.bold + 'No advertisement file exists, starting to explore '.yellow.bold + peripheralId.cyan.bold)
        wsclient.explore(peripheralId, readValues);
    } else {
        console.log('Services file for '.yellow.bold + peripheralId.cyan.bold + ' already saved, skipping. Use -o option to overwrite.'.yellow.bold);
    }
  })

}

//check if the services file exists
function checkFile(peripheralId, callback) {
  if (overWriteServices) {
    callback(false);
  } else {
    fs.stat(devicesPath + '/' + peripheralId + '.srv.json', function(err, stat) {
      if(err == null) {
        callback(true);
        //  console.log('File exists');
      } else {
        callback(false)
      }
    });   
  }
}


wsclient.on('stateChange', function(state) {
  if (state === 'poweredOn') {
    if (specifiedPeripheral) {
      console.log('[+]'.green.bold + 'Start exploring '.yellow.bold + specifiedPeripheral.cyan.bold);      
      exploreSpecified(specifiedPeripheral)
    } else {
      console.log('Start scanning.');
      wsclient.startScanning();      
    }
  } else if (state === 'unknown') {
    console.log('state unknown - waiting...')
  } else {
    wsclient.stopScanning();    
  }
});


wsclient.on('discover', function(peripheralId, address, addressType, connectable, advertisement, rssi) {

        if (saveAdvertisements) {
          utils.saveAdvertisement(peripheralId, address, addressType, connectable, advertisement, rssi);
        }

        if (!peripherals[peripheralId]) {
          peripherals[peripheralId] = { explored: false, triedToExplore: false};
        }

})


wsclient.on('explore', function(peripheralId, state, servicesJson){

  console.log('[+]'.green.bold +'Explore state: '.yellow.bold + peripheralId.cyan.bold + ' - ' + state.magenta.bold);
  if(state === 'finished') {

    var filename = devicesPath+'/'+peripheralId+'.srv.json';

    fs.writeFile(filename, JSON.stringify(servicesJson, null, 4), function(err) {
        if(err) {
           return console.log(err);
        }
         console.log('[+]'.green.bold +"Services file ".yellow.bold+ filename.white.bold +" saved!".yellow.bold);
         if (peripheralId === specifiedPeripheral) {
            process.exit(0);         
         }

    }); 
  }
})
