# sensorjs-ble

BLE sensor networks and drivers for sensorjs

[https://github.com/daliworks/sensorjs](https://github.com/daliworks/sensorjs)

## Installation

    $ npm install sensorjs-ble

### BLE library

<b>noble</b>
  - [https://github.com/sandeepmistry/noble](https://github.com/sandeepmistry/noble)


    $ sudo apt-get install build-essential
    $ sudo apt-get install bluez
    $ sudo apt-get install libbluetooth-dev

## Example
```js
var connect = require('sensorjs'),
    sensorApp = connect.sensor,
    bleSensor = require('sensorjs-ble');

sensorApp.addSensorPackage(bleSensor);

sensorApp.discover('sensorTagHum', function (err, devices) {
  'use strict';

  console.log('discovered devices', devices, err);

  devices.forEach(function (device) {
    device.sensorUrls.forEach(function (sensorUrl) {
      var sensor, parsedSensorUrl, props;

      sensor = sensorApp.createSensor(sensorUrl);

      parsedSensorUrl = sensorApp.parseSensorUrl(sensorUrl);

      props = sensorApp.getSensorProperties(parsedSensorUrl.model);

      if (props.onChange) {
        sensor.on('change', function (data) {
          console.log('[[ble sensor]] on change - data', data);
        });

        sensor.listen('change');
      } else {
        sensor.on('data', function(data) {
          console.log('[[ble sensor]] sensor data', data);
        });

        sensor.listen();
      }
    });
  });
});
```

## Contributor

[https://github.com/daliworks/sensorjs-ble/graphs/contributors](https://github.com/daliworks/sensorjs-ble/graphs/contributors)

## License

(The MIT License)

Copyright (c) 2013 [Daliworks Inc](http://www.daliworks.co.kr)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


[@sensorjs](https://twitter.com/sensorjs)
