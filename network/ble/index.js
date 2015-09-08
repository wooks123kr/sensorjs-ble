'use strict';

var util = require('util'),
  noble = require('noble'),
  async = require('async'),
  _ = require('lodash');

//internal lib
var sensorDriver = require('../../index'),
    Network = sensorDriver.Network,
    Device = sensorDriver.Device;

var DEVICE_SCAN_TIMEOUT = 8000,
    DEVICE_CONN_TIMEOUT = 5000,
    SERVICE_DISCOVERY_TIMEOUT = 5000;

var logger = Network.getLogger();

function Ble(options) {
  Network.call(this, 'ble'/*networkName*/, options);
}

util.inherits(Ble, Network);

Ble.prototype.getDevice = function (addr, options, cb) {
  var self = this;

  if (typeof options === 'function') {
    cb = options;
  }

  //logger.debug("noble._peripherals: "+util.inspect(noble._peripherals));
  /*
  if (this.device && this.device.deviceHandle &&
      noble._peripherals[addr] && noble._peripherals[addr].state === 'connected') {
      */
  if (this.device && this.device.deviceHandle && this.device.addr === addr &&
      noble._peripherals[addr] && noble._peripherals[addr].state === 'connected') {
    logger.debug('[BLE/Network] Device:' + addr + ' is already connected');
    return cb && cb(null, this.device);
  }

  if (this.underDiscover) {
    logger.warn('[BLE/Network] getDevice('+addr+') Under discovering');
    return cb && cb(new Error('under discovering'));
  }

  // TODO: connect directly without scanning if the sensor device(peripheral) is registered
  if (this.device && this.device.deviceHandle && this.device.addr === addr && 
      noble._peripherals[addr]) {
    logger.debug('[BLE/Network] getDevice(' + addr + ') this.device: ' + util.inspect(this.device));
    logger.debug('[BLE/Network] getDevice(' + addr + ') state: ' + noble._peripherals[addr].state);
    this._connect(this.device.deviceHandle, function(err){
      return cb && cb(err, this.device);
    });  
    return;
  }

  this._discover(addr, options.model, options.serviceUUID, options, function (err, device) {
    self.underDiscover = false;
    return cb && cb(err, device);
  });
};

Ble.prototype.discover = function (driverName/*or model*/, options, cb) {
  var self = this,
      peripherals = [],
      filter,
      models;

  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }else {
    if (options && _.has(options, 'serviceUUID')){
      filter = options.serviceUUID;
    }
  }

  if (this.underDiscover) {
    if (cb) {
      cb(new Error('already scanning'));
    } else {
      this.emit('discover', 'error', new Error('already scanning'));
    }
    return;
  }

  this.underDiscover = true;

  var onDiscover = function(peripheral) {
    logger.debug('[BLE/Network] On discover', peripheral.uuid, peripheral.advertisement);
    peripherals.push(peripheral);
  };

  var startScan = function () {
    if (self.scanTimer) {
      logger.error('[BLE/Network] already startScan');
      return; //already scan
    }

    noble.on('discover', onDiscover);

    logger.debug('filter = ' + util.inspect(filter));
    noble.startScanning(filter);

    self.scanTimer = setTimeout(function () {
      self.scanTimer = null;
      noble.removeListener('discover', onDiscover);
      noble.stopScanning();
    }, DEVICE_SCAN_TIMEOUT);
  };

  noble.once('scanStart', function () {
    logger.debug('[BLE/Network] On scanStart');
  });

  noble.once('scanStop', function () {
    var founds = [];

    if (self.scanTimer) {
      clearTimeout(self.scanTimer);
      self.scanTimer = null;
    }

    logger.debug('[BLE/Network] On scanStop');

    if (cb) {
      self.emit('discover', 'scanStop');
    }

    //logger.debug('[BLE/Network] peripherals ' + peripherals);
    logger.debug('[BLE/Network] models ' + models);
    _.forEach(peripherals, function (peripheral) {
      _.forEach(models, function (model) {
        var props = sensorDriver.getSensorProperties(model);
        logger.debug('[BLE/Network] props ' + props);

        if (peripheral.advertisement && peripheral.advertisement.localName && props && props.bleLocalName &&
            peripheral.advertisement.localName.toUpperCase() === props.bleLocalName.toUpperCase()) {
          var device = new Device(self, peripheral.uuid,
              [{ id: model + '-' + peripheral.uuid, model: model }]);

          founds.push(device);

          self.emit('discovered', device);
        }
      });
    });

    logger.debug('[BLE/Network] founds', founds);

    self.underDiscover = false;

    return cb && cb(null, founds);
  });

  // 1. Get models from driverName or from model
  models = sensorDriver.getDriverConfig()[driverName];
  if (!models) { //find model
    if(_.findKey(sensorDriver.getDriverConfig(), function (models) {
      return _.contains(models, driverName);
    })) {
      models = [driverName];
    } else {
      return cb && cb(new Error('model not found'));
    }
  }

  // 2. Start BLE Scanning
  logger.debug('noble.state', noble.state);
  if (noble.state === 'poweredOn' || noble.state === 'unsupported') {
    startScan();
  } else {
    noble.once('stateChange', function() {
      startScan();
    });
  }
};

Ble.prototype._connect = function(peripheral, cb){
  var self = this;
  var connTimer = setTimeout(function () {
    try { peripheral.disconnect(); } catch (e) {}

    connTimer = null;

    logger.warn('[BLE/Network] _connect() Timeout on connecting with peripheral',
      DEVICE_CONN_TIMEOUT, peripheral.uuid);

    return cb && cb(new Error('_connect() Timeout on connecting with peripheral'));
  }, DEVICE_CONN_TIMEOUT);

  /*
  peripheral.once('error', function () {
    if (connTimer) {
      try { peripheral.disconnect(); } catch (e) {}
      clearTimeout(connTimer);
      connTimer = null;
    }
    logger.error('[BLE/Network] _connect() On error with peripheral', peripheral.uuid);
  });
  */

  peripheral.connect(function (error) {
    if (error) {
      logger.error('[BLE/Network]_connect()  Error on connecting to the peripheral', peripheral.uuid, error);
      return cb && cb(new Error('_connect() Error on connecting to the peripheral'));
    }

    if (connTimer) {
      clearTimeout(connTimer);
      connTimer = null;
      logger.debug('[BLE/Network] _connect() Clearing timeout of connTimer');
    } else {
      logger.warn('[BLE/Network] _connect() Return - already timeout on connecting with peripheral', peripheral.uuid);
      return; //do nothing already timeout
    }
    return cb && cb(error);
  });
};

Ble.prototype._discover = function (addr, model, serviceUUID, options, cb) {
  var self = this;

  if (this.underDiscover) {
    if (cb) {
      cb(new Error('already discovering'));
    } else {
      this.emit('discover', 'error', new Error('already discovering'));
    }
    return;
  }

  this.underDiscover = true;
  this.peripheral = null;

  var onDiscover = function(peripheral) {
    logger.debug('on discover', addr, peripheral.uuid, peripheral.advertisement);

    if (addr === peripheral.uuid) {
      self.peripheral = peripheral;
      logger.debug('on discover - discovered', peripheral.uuid);
    }
    if (self.scanTimer) { // reschedule timer
      clearTimeout(self.scanTimer);
      logger.debug('extends timer trigger time');
      self.scanTimer = setTimeout(function () {
        self.scanTimer = null;
        noble.removeListener('discover', onDiscover);
        logger.debug('onDiscover(): scan timed out ' );
        noble.stopScanning();
      }, DEVICE_SCAN_TIMEOUT);
    }
  };

  var startScan = function () {
    if (self.scanTimer) {
      logger.error('[BLE/Network] already startScan');
      return; //already scan
    }

    noble.on('discover', onDiscover);
    noble.startScanning(serviceUUID);

    self.scanTimer = setTimeout(function () {
      self.scanTimer = null;
      noble.removeListener('discover', onDiscover);
      logger.debug('startScan(): scan timed out ' );
      noble.stopScanning();
    }, DEVICE_SCAN_TIMEOUT);
  };

  noble.once('scanStart', function () {
    logger.debug('on scanStart');
  });

  noble.once('scanStop', function () {
    var peripheral, connTimer;

    if (self.scanTimer) {
      clearTimeout(self.scanTimer);
      self.scanTimer = null;
    }

    logger.debug('[BLE/Network] On scanStop');

    if (cb) {
      self.emit('discover', 'scanStop');
    }

    if (self.peripheral) {
      peripheral = self.peripheral;

      connTimer = setTimeout(function () {
        try { peripheral.disconnect(); } catch (e) {}

        connTimer = null;

        logger.warn('[BLE/Network] Timeout on connecting with peripheral',
            DEVICE_CONN_TIMEOUT, peripheral.uuid);

        return cb && cb(new Error('Timeout on connecting with peripheral'));
      }, DEVICE_CONN_TIMEOUT);

      peripheral.once('error', function () {
        if (connTimer) {
          try { peripheral.disconnect(); } catch (e) {}
          clearTimeout(connTimer);
          connTimer = null;
        }
        logger.error('[BLE/Network] On error with peripheral', peripheral.uuid);
      });

      peripheral.connect(function (error) {
        var svcTimer;

        if (error) {
          logger.error('[BLE/Network] Error on connecting to the peripheral', peripheral.uuid, error);
          return cb && cb(new Error('Error on connecting to the peripheral'));
        }

        if (connTimer) {
          clearTimeout(connTimer);
          connTimer = null;
          logger.debug('[BLE/Network] Clearing timeout of connTimer');
        } else {
          logger.warn('[BLE/Network] Return - already timeout on connecting with peripheral', peripheral.uuid);
          return; //do nothing already timeout
        }

        logger.debug('[BLE/Network] Connected and Discovering service', peripheral.uuid, peripheral.advertisement);

        svcTimer = setTimeout(function () {
          try { peripheral.disconnect(); } catch (e) {}

          svcTimer = null;

          logger.info('[BLE/Network] Timeout on discovering services of peripheral',
              SERVICE_DISCOVERY_TIMEOUT, peripheral.uuid);

          return cb && cb(new Error('Timeout on discovering services of peripheral'));
        }, SERVICE_DISCOVERY_TIMEOUT);

        logger.debug('[BLE/Network] discoverSomeServicesAndCharacteristics() w/ filter '+ serviceUUID);

        var props = sensorDriver.getSensorProperties(model);
        var chars = [props.ble.data, props.ble.config];

        peripheral.discoverSomeServicesAndCharacteristics([serviceUUID], chars, function (error, services) {
          var device;

          if (error) {
            logger.error('[BLE/Network] Error with discoverSomeServicesAndCharacteristics', error);
            return cb && cb(error);
          }

          if (svcTimer) {
            clearTimeout(svcTimer);
            svcTimer = null;
            logger.debug('[BLE/Network] Clearing timeout of svcTimer');
          } else {
            logger.warn('[BLE/Network] Return - already timeout on discovering services', peripheral.uuid);
            return; //do nothing already timeout
          }

          logger.debug('[BLE/Network] Services are discovered', util.inspect(services));
          logger.debug('[BLE/Network] Services characteristics' , util.inspect(services, {showHidden : false, depth: 3}));

          //props = sensorDriver.getSensorProperties(model);

          _.forEach(services, function (service) {
            if (service.uuid === props.ble.service) {
              device = new Device(self, peripheral.uuid,
                          [{id:model + '-' + peripheral.uuid,
                            model: model,
                            deviceHandle: peripheral}]);

              peripheral.once('disconnect', function() {
                logger.debug('[BLE/Network] Peripheral disconnect / address=', device.address);
                self.emit('disconnect', device);
              });

              logger.debug('[BLE/Network] BLE with service uuid is found and device is created', device);
              self.emit('discovered', device);

              self.device = device;

              return false;
            }
          });

          return cb && cb(null, self.device);
        });
      });
    } else {
      logger.warn('[BLE/Network] On discovering, peripheral is not discovered');
      self.emit('discovered', 'no device');

      return cb && cb(new Error('ble device is not discovered'));
    }
  });

  logger.debug('noble.state', noble.state);

  if (noble.state === 'poweredOn' || noble.state === 'unsupported') {
    startScan();
  } else {
    noble.once('stateChange', function() {
      startScan();
    });
  }
};

module.exports = new Ble();
