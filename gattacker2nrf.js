require('env2')('config.env');

var debug = require('debug')('replay');
var fs = require('fs');
var util = require('util');
var utils = require('./lib/utils')
var path=require('path');
var events = require('events');
var getopt = require('node-getopt');
var colors = require('colors');

var options = new getopt([
  ['i' , 'input=FILE'  , 'input file'],
  ['h' , 'help' , 'display this help'],
]);
options.setHelp("Usage: node replay -i <FILE> [ > <FILE> ]\n[[OPTIONS]]" )

opt=options.parseSystem();

if ( !opt.options.input)  {
  console.info(options.getHelp());
  process.exit(0);
}

if (opt.options.output) {
    var outputFile=opt.options.output;
}

//nrf requires strict UUID format
function formatUuid(Uuid) {
	var formatted='';
	//expand short service/characteristic UUID
	if (Uuid.length == 4) {
		formatted='0000' + Uuid + '-0000-1000-8000-00805f9b34fb';
	}
	else { //just add dashes 
		formatted = Uuid.slice(0,8)+'-'+Uuid.slice(8,12)+'-'+Uuid.slice(12,16)+'-'+Uuid.slice(16,20)+'-'+Uuid.slice(20,32);
	}
	return formatted;
}

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
    console.log('</macro>')
  });
}

function parse(line) {
  // format:   
  // 2017.03.23 23:41:32.233 | > R | 180a (optional name) | 2a26 (optional name) | 05290101201504282034 (ascii data)
  var arr=line.split('|');
  var operator = arr[1].trim();
  var serviceUuid = formatUuid(arr[2].trim().split(' ')[0]); //split(' ') to remove optional description
  var uuid = formatUuid(arr[3].trim().split(' ')[0]);
  var data = arr[4].trim().split(' ')[0];

  switch(operator) {
 // tbd - type="WRITE_REQUEST"/"WRITE_COMMAND" in output XML file
 // does not work stable in nRF currently
   case '< W' :
   case '< C' : out = ' <write description="gattacker write replay" service-uuid="'+ serviceUuid + '" characteristic-uuid="' + uuid + '" value="' + data.toString('hex') + '"  />\n';  
    			 break; 
    case '> R' : out = ' <read description="gattacker read replay" service-uuid="'+ serviceUuid + '" characteristic-uuid="' + uuid + '" >\n' + 
			'        <!-- <assert-value description="optional value condition" value="' + data.toString('hex') + '" /> --> \n</read>\n';
    			break;
    case '> N' : out = ' <wait-for-notification description="gattacker wait for notification" service-uuid="' + serviceUuid +'" characteristic-uuid="' + uuid + '" >\n' + 
  			'        <!-- <assert-value description="optional wait for specific value" value="' + data.toString('hex') + '" /> --> \n </wait-for-notification>\n'; break;
  			    break
  }
  console.log(out);
}

console.log('<macro name="gattacker replay" icon="MAGIC">');
var inputData = fs.createReadStream(opt.options.input,'utf8');
readLines(inputData,parse);

