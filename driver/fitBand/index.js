'use strict';

var util = require('util'),
    band = require('./band'),
    _ = require('lodash');

var sensorDriver = require('../../index'),
    Sensor = sensorDriver.Sensor,
    logger = Sensor.getLogger();

var ble;

function FitBand(sensorInfo, options) {
  Sensor.call(this, sensorInfo, options);
  if (sensorInfo.model) {
    this.model = sensorInfo.model;
  }
  ble = sensorDriver.getNetwork('ble');
  logger.info('Fitband', sensorInfo);
}

FitBand.properties = {
  supportedNetworks: ['ble'],
  dataTypes: ['stepCount', 'sleppStage', 'batteryGauge'],
  onChange: false, // FIXME: app.listen
  discoverable: true,
  recommendedInterval: 15000,
  validCachedValueTimeout: 7000,
  maxInstances: 100,
  models: ['Fitband'],
  ble: {
    service: 'fff0',
    config: 'fff1', // handle 0x0051 ~ 0x0052
    data: 'fff2'    // handle 0x0054 ~ 0x0055
  },
  bleLocalName: 'Fitband',
  idTemplate: '{deviceAddress}-{type}-{sequence}', // id generation template
  category: 'sensor'
};

util.inherits(FitBand, Sensor);

/*
FitBand.prototype.listen = funtcion(interval){
}
*/

FitBand.prototype.readBatteryGauge = function(cb){
  try{
    var peripheral  = this.deviceHandle;
    peripheral.readHandle(0x0036, function batteryGaugeCallback(error, data){
      if (error || !data) {
        cb && cb(error, null);
        return;
      }
      cb(null, data);
    });
  }catch(error){
    cb(error, null);
  }
}

FitBand.prototype.readStepCount = function(cb){
  var service, dataChar, configChar;
  service = this.deviceHandle && this.deviceHandle.services &&
        _.find(this.deviceHandle.services, {uuid: FitBand.properties.ble.service});
  if (service && service.characteristics) {
    dataChar = _.find(service.characteristics, {uuid: FitBand.properties.ble.data});
    configChar = _.find(service.characteristics, {uuid: FitBand.properties.ble.config});
  }

  //logger.debug('dataChar : ' , dataChar);
  //logger.debug('configChar : ' , configChar);
  if (dataChar && configChar) {
    logger.debug('enable data');
    var notificationCallback = function(data,  isNotification){
      if (!data){
        logger.error("ERROR : data is invalid");
        return cb && cb(new Error('ERROR : data is invalid'), null);
      }

      /*
      if (!band.isStepCount(data)){
        // process batteryGauge or sleepStage
        logger.info('set notification callback for data');
        configChar.once('data', notificationCallback);
        return;
      }
      */
      //logger.debug("data 0(" + data.length + ") ["+ data.toJSON() + "] received notification? = " + isNotification);
      var steps = band.processData(data);
      return cb && cb (null, steps);
    };

    configChar.once('data', notificationCallback);

    var opcode = band.OPCODE_CURRENT_STEPS ;
    // subscribe notification
    //this.deviceHandle.writeHandle(band.HANDLE_SET_NOTIFICATION, new Buffer([0x01,0x00]), false, function(err){
    this.deviceHandle.writeHandle(0x0053, new Buffer([0x01,0x00]), false, function(err){
      if (err){
        logger.error("failed to subscribe notification");
        return;
      }
      try{
      dataChar.write(new Buffer([opcode, 0x01,0x08,0x08]), false, function callback(err){
        if (err){
          logger.error("failed to write command");
          return;
        }
        logger.info("write command: " + opcode.toString(16) + " succeed");
      });
      }catch (e){
        logger.error("failed to write command: " + e);
        return cb && cb(new Error('ERROR : cannot write opcommand ' + opcode.toString(16)), null);
      }
    });
  }else{
    return cb && cb(new Error('cannot read steps'), null);
  }
};

FitBand.prototype._get = function () {
  var result = {},
      self = this,
      options;
  if (this.deviceHandle && this.deviceHandle.state === 'connected') {
    logger.debug('[FitBand] W/ deviceHandle', this.deviceHandle.state);

    this.readStepCount(function (err, data) {
      if (err) {
        self.emit('data', {status: 'error', id : self.id, message: err || 'read error'});
      } else {
        result[_.first(FitBand.properties.dataTypes)] = data;
        self.emit('data', {status: 'ok', id: self.id, mac: self.info.device.address, type: 'stepCount', result: result});
      }
    });
    this.readBatteryGauge(function (err, data) {
      if (err) {
        logger.error("readBatteryGauge CB :"+ util.inspect(err) + 'data = ' + data);
        self.emit('battery', {status: 'error', id : self.id, message: err || 'read error'});
      } else {
        result[_.last(FitBand.properties.dataTypes)] = data[0];
        self.emit('battery', {status: 'ok', id: self.id, mac: self.info.device.address, type: 'batteryGauge', result: result});
      }
    });
  } else {
    if ( this.deviceHandle ) {
      logger.debug('[FitBand] W/ deviceHandle', this.deviceHandle.state);
      console.trace();
    }
    logger.debug('[FitBand] _get(): this = ' + util.inspect(self));
    if ( this.info) logger.debug('[FitBand] _get(): trying to getDevice() again: ' +self.info.device.address);
    // scan(search) options
    options = {
      model: this.model,
      serviceUUID : FitBand.properties.ble.service
    };
    ble.getDevice(this.info.device.address, options,function (err, device) {
      if (!err && device) {
        logger.debug('[FitBand] _get(): getDevice().callback() self = ' + util.inspect(self));
        self.deviceHandle = device.deviceHandle[self.info.id];
        self.readStepCount(function (err, data) {
          if (err) {
            self.emit('data', {status: 'error', id : self.id, message: err || 'read error'});
          } else {
            result[_.first(FitBand.properties.dataTypes)] = data;
            self.emit('data', {status: 'ok', id : self.id, mac: self.info.device.address, type: 'stepCount', result: result});
          }
        });
        self.readBatteryGauge(function (err, data) {
          if (err) {
            logger.error("readBatteryGauge CB :"+ util.inspect(err) + 'data = ' + data);
            self.emit('battery', {status: 'error', id : self.id, message: err || 'read error'});
          } else {
            result[_.last(FitBand.properties.dataTypes)] = data[0];
            self.emit('battery', {status: 'ok', id: self.id, mac: self.info.device.address, type: 'batteryGauge', result: result});
          }
        });
      }
    });
  }
};

module.exports = FitBand;
