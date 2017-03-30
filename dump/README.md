Here the scanner saves log dump files with the contents of intercepted transmission.

File format:

`timestamp | type | service UUID (optional name) | characteristic UUID (optional name) | hex data (ascii data)`

example: 

`2017.03.24 17:55:10.930 | > R | 180f (Battery Service) | 2a19 (Battery Level) | 50 (P)`

type can be:
```
> R - received read
> N - received notification
< W - sent write request (without response)
< C - sent write command (with response)
```

Standard UUIDs are in short version.

Example file of a sniffed smart lock communication (password 12345678) attached.