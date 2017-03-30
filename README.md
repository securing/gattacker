![gattacker](https://raw.githubusercontent.com/securing/gattacker/master/logo/gattacker.png)


A Node.js package for BLE (Bluetooth Low Energy) Man-in-the-Middle & more.


## Prerequisites

see:

https://github.com/sandeepmistry/noble

https://github.com/sandeepmistry/bleno


## Install

```sh
npm install gattacker
```

## Usage

### Configure 

Running both components Set up variables in config.env:

* NOBLE_HCI_DEVICE_ID : noble ("central", ws-slave) device
* BLENO_HCI_DEVICE_ID : bleno ("peripheral", advertise) device

If you run "central" and "peripheral" modules on separate boxes with just one BT4 interface, you can leave the values commented.


* WS_SLAVE : IP address of ws-slave box
* DEVICES_PATH : path to store json files 

### Start "central" device 

```sh
sudo node ws-slave
```
Connects to targeted peripheral and acts as websocket server.


Debug: 

```sh
DEBUG=ws-slave sudo node ws-slave
```

### Scanning

#### Scan for advertisements

```sh
node scan
```
Without parameters scans for broadcasted advertisements, and records them as json files (.adv.json) in DEVICES_PATH 


#### Explore services and characteristics

```sh
node scan <peripheral>
```
Explore services and characteristics of chosen peripheral. 
Saves the explored service structure in json file (.srv.json) in DEVICES_PATH.


### Hook configuration (option)

For active request/response tampering configure hook functions for characteristic in device's json services file.

Example:

```javascript
            {
                "uuid": "06d1e5e779ad4a718faa373789f7d93c",
                "name": null,
                "properties": [
                    "write",
                    "notify"
                ],
                "startHandle": 8,
                "valueHandle": 9,
                "endHandle": 10,
                "descriptors": [
                    {
                        "handle": 10,
                        "uuid": "2902",
                        "value": ""
                    }
                ],
                "hooks": {
                    "dynamicWrite": "dynamicWriteFunction",
                    "dynamicNotify": "customLog"
                }
            }
```

Functions:

<dynamic|static><Write|Read|Notify> 

 dynamic: connect to original device

 static: do not connect to original device, run the tampering function locally

 It will try to invoke the specified function from hookFunctions, include your own.
 A few examples provided in hookFunctions subdir.

staticValue - static value



### Start "peripheral" device 

```sh
node advertise -a <advertisement_json_file> [ -s <services_json_file> ]
```

It connects via websocket to ws-slave in order to forward requests to original device.
Static run (-s) sets services locally, does not connect to ws-slave. You have to configure the hooks properly.

## MAC address cloning

For many applications it is necessary to clone MAC address of original device.
A helper tool bdaddr from Bluez is provided in helpers/bdaddr.

```sh
cd helpers/bdaddr
make
```

wrapper script:

```sh
./mac_adv -a <advertisement_json_file> [ -s <services_json_file> ]
```

## Dump, replay

Dump files are saved in a path configured by `DUMP_PATH` in config.env (by default `dump`).
More info:
https://github.com/securing/gattacker/wiki/Dump-and-replay

## Troubleshooting

Turn off, cross fingers, try again ;)

### reset device

```sh
hciconfig <hci_interface> reset
```

### Running ws-slave and advertise on the same box

With this configuration you may experience various problems.

Try switching NOBLE_HCI_INTERFACE and BLENO_HCI_INTERFACE


### hcidump debug

```sh
hcidump -x -t <hci_interface>
```

## FAQ, more information

FAQ: [https://github.com/securing/gattacker/wiki/FAQ](https://github.com/securing/gattacker/wiki/FAQ)

More information: [www.gattack.io](www.gattack.io)



## License

Copyright (C) 2016 Slawomir Jasek, SecuRing <slawomir.jasek@securing.pl>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

