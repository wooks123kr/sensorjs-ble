'use strict';

var util = require('util'),
    _ = require('lodash');
    
var sensorDriver = require('../../index'),
    Sensor = sensorDriver.Sensor,
    logger = Sensor.getLogger();

var ble;

function SensorTagHum(sensorInfo, options) {
  Sensor.call(this, sensorInfo, options);
  ble = sensorDriver.getNetwork('ble');
}

SensorTagHum.properties = {
  supportedNetworks: ['ble'],
  dataTypes: ['humidity'],
  onChange: false, // FIXME: app.listen
  discoverable: true,
  recommendedInterval: 20000,
  validCachedValueTimeout: 7000,
  maxInstances: 1,
  models: ['sensorTagHum'],
  ble: {
    service: 'f000aa2004514000b000000000000000',
    config: 'f000aa2204514000b000000000000000',
    data: 'f000aa2104514000b000000000000000'
  },
  bleLocalName: 'SensorTag',
  id: '{model}-{address}'
};

util.inherits(SensorTagHum, Sensor);

SensorTagHum.prototype.readHumData = function(cb) {
  var service, dataChar, configChar;

  service = this.deviceHandle && this.deviceHandle.services && 
        _.find(this.deviceHandle.services, {uuid: SensorTagHum.properties.ble.service});

  if (service && service.characteristics) {
    dataChar = _.find(service.characteristics, {uuid: SensorTagHum.properties.ble.data});
    configChar = _.find(service.characteristics, {uuid: SensorTagHum.properties.ble.config});
  }

  if (dataChar && configChar) {
    logger.debug('[SensorTagHum] enable data');

    // to enable Characteristic
    configChar.write(new Buffer([0x01]), false, function () { // FIXME: config first time only, error handling(timeout)
      logger.debug('[SensorTagHum] data read');

      dataChar.read(function (err, data) {
        if (!err && data) {
          var humidity = -6.0 + 125.0 / 65536.0 * (data.readUInt16LE(2) & ~0x0003);
          logger.debug('[SensorTagHum] humidity', humidity);

          return cb && cb(null, humidity);
        } else {
          return cb && cb(err);
        }
      });
    });
  } else {
    return cb && cb (new Error('service or charateristics not found'));
  }
};

SensorTagHum.prototype._get = function () {
  var self = this,
      result = {},
      options;

  if (this.deviceHandle && this.deviceHandle.state === 'connected') {
    logger.debug('[SensorTagHum] W/ deviceHandle', this.deviceHandle.state);

    this.readHumData(function (err, data) {
      if (err) {
        self.emit('data', {status: 'error', id : self.id, message: err || 'read error'});
      } else {
        result[_.first(SensorTagHum.properties.dataTypes)] = data;
        self.emit('data', {status: 'ok', id: self.id, result: result});
      }
    });
  } else {
    logger.debug('[SensorTagHum] Getting Device', this.info, this.deviceHandle && this.deviceHandle.state);

    options = {
      model: this.model,
      serviceUUID: SensorTagHum.properties.ble.service
    };

    ble.getDevice(this.info.device.address, options, function (err, device) {
      if (err) {
        self.emit('data', {status: 'error', id : self.id, message: err || 'error on getting device'});
      } else {
        if (device) {

          self.deviceHandle = device.deviceHandle[self.info.id];
          logger.debug('[SensorTagHum] Device is ready - self.deviceHandle.services',
              self.deviceHandle && self.deviceHandle.services);

          self.readHumData(function (err, data) {
            if (err) {
              self.emit('data', {status: 'error', id : self.id, message: err || 'read error'});
            } else {
              result[_.first(SensorTagHum.properties.dataTypes)] = data;
              self.emit('data', {status: 'ok', id : self.id, result: result});
            }
          });
        }
      }
    });
  }
};

SensorTagHum.prototype._clear = function () {
  logger.info('[SensorTagHum] clearing ble sensor', this.info.id, this.deviceHandle);

  if (this.deviceHandle && typeof this.deviceHandle.disconnect) {
    this.deviceHandle.disconnect();
    delete this.deviceHandle;
  }
};

module.exports = SensorTagHum;
