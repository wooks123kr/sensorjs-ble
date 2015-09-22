var util = require('util'),
    fitband = require('./band'),
    Promise = require('bluebird'),
    _ = require('lodash');

var sensorDriver = require('../../index'),
    Sensor = sensorDriver.Sensor,
    logger = Sensor.getLogger();

var ble;

// disconnect timeout
var DISCONNECT_TIMEOUT = 1000;
// timeout for reading activity 
var READ_TIMEOUT = 5000;

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
  dataTypes: ['stepCount', 'weeklyData', 'sleepStage', 'batteryGauge'],
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

FitBand.prototype.readBatteryGauge = function(cb){
  try{
    var peripheral  = this.deviceHandle;
    peripheral.readHandle(0x0036, function batteryGaugeCallback(error, data){
      if (error || !data) {
        return cb && cb(error, null);
      }
      cb(null, data);
    });
  }catch(error){
    cb(error, null);
  }
};

var count = 0;

// ALERT: 항상 readStepCount() 이후에 불려야 한다. 왜냐면 notification
// enable시키는 부분을 굳이 2번할 필요없기 때문이다.
FitBand.prototype.readWeeklyStepCount = function(cb){
  var service, dataChar, configChar;
  var self = this;

  if (self.readTimer){
    logger.warn('previous read request not finished');
    return cb && cb(new Error('previous read request not finished'), null);
  }

  service = this.deviceHandle && this.deviceHandle.services &&
        _.find(this.deviceHandle.services, {uuid: FitBand.properties.ble.service});
  if (service && service.characteristics) {
    dataChar = _.find(service.characteristics, {uuid: FitBand.properties.ble.data});
    configChar = _.find(service.characteristics, {uuid: FitBand.properties.ble.config});
  }

  // TODO: 매년 1월 1일은 어떻게 될 것인가?
  // 전날 12:59:59:000 로 정함 
  var now = new Date();
  var ellapsedTimeInMillis = (now.getHours() * 60 * 60 + now.getMinutes()*60 + now.getSeconds()) * 1000  + now.getMilliseconds();
  var yesterday = new Date(now.getTime() - ellapsedTimeInMillis - 1000);

  logger.debug('readStepWeeklyCount() id: ' , this.deviceHandle.address);
  if (!dataChar || !configChar) {
    return cb && cb(new Error('cannot read steps'), null);
  }
  logger.error('enable data: '+count++);
  var notificationCallback = function(data,  isNotification){
    clearTimeout(self.readTimer);
    self.readTimer = null;
    if (!data){
      logger.error("ERROR : data is invalid");
      return cb && cb(new Error('ERROR : data is invalid'), null);
    }

    //logger.debug("data 0(" + data.length + ") ["+ data.toJSON() + "] received notification? = " + isNotification);
    var steps = fitband.processData(data);
    if (steps === undefined || steps === null){
      return cb && cb(new Error('ERROR : cannot read data from device'), null);
    }
    var result = { 'steps' : steps, 'ctime' : yesterday };
    return cb && cb (null, result);
  };

  self.readTimer = setTimeout(function(){
    self.readTimer = null;
    logger.warn('readWeeklyStepCount timed out ');
    configChar.removeListener('data', notificationCallback);
  }, 5000);

  //logger.error('configChar # of listeners' + util.inspect(configChar.listenerCount('data')));
  //configChar.removeAllListeners(['data']);
  configChar.removeListener('data', notificationCallback);
  configChar.once('error', function(error){
    logger.error('configChar error ' + error);
  });
  configChar.once('data', notificationCallback);

  var opcode = fitband.OPCODE_CURRENT_STEPS ;
  var dayOfWeek = yesterday.getDay();
  dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
  logger.debug('the day of week of yesterday : ' + dayOfWeek);
  var buffer = new Buffer([opcode, 0x01, dayOfWeek, dayOfWeek ]);
  try{
    dataChar.write(buffer, false, function callback(err)  {
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
};

FitBand.prototype.readStepCount = function(cb){
  var service, dataChar, configChar;
  var self = this;

  if (self.readTimer){
    logger.warn('previous read request not finished');
    return cb && cb(new Error('previous read request not finished'), null);
  }

  service = this.deviceHandle && this.deviceHandle.services &&
        _.find(this.deviceHandle.services, {uuid: FitBand.properties.ble.service});
  if (service && service.characteristics) {
    dataChar = _.find(service.characteristics, {uuid: FitBand.properties.ble.data});
    configChar = _.find(service.characteristics, {uuid: FitBand.properties.ble.config});
  }

  logger.debug('readStepCount() id: ' , this.deviceHandle.address);
  if (!dataChar || !configChar) {
    return cb && cb(new Error('cannot read steps'), null);
  }
  logger.error('enable data: '+count++);
  var readStepCountCB = function(data,  isNotification){
    clearTimeout(self.readTimer);
    self.readTimer = null;
    if (!data){
      logger.error("ERROR : data is invalid");
      return cb && cb(new Error('ERROR : data is invalid'), null);
    }

    //logger.debug("data 0(" + data.length + ") ["+ data.toJSON() + "] received notification? = " + isNotification);
    var steps = fitband.processData(data);
    if (steps === undefined || steps === null){
      return cb && cb(new Error('ERROR : cannot read data from device'), null);
    }
    var result = { 'steps' : steps, 'ctime': new Date() };
    return cb && cb (null, result);
  };

  self.readTimer = setTimeout(function(){
    self.readTimer = null;
    logger.warn('readStepCount timed out ');
    configChar.removeListener('data', readStepCountCB);
  }, READ_TIMEOUT);

  logger.error('configChar listeners' + util.inspect(configChar.listeners('data')));
  //logger.error('configChar # of listeners' + util.inspect(configChar.listenerCount('data')));
  //configChar.removeAllListeners(['data']);
  configChar.removeListener('data', readStepCountCB);
  configChar.once('error', function(error){
    logger.error('configChar error ' + error);
  });
  //configChar.once('data', readStepCountCB);

  var opcode = fitband.OPCODE_CURRENT_STEPS ;
  // subscribe notification
  this.deviceHandle.writeHandle(0x0053, new Buffer([0x01,0x00]), false, function(err){
    if (err){
      logger.error("failed to subscribe notification");
      return;
    }
    configChar.once('data', readStepCountCB);
    try{
      // read current steps
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
};

FitBand.prototype._get = function () {
  var result = {},
      self = this,
      options;
  if (this.deviceHandle && this.deviceHandle.state === 'connected') {
    logger.debug('[FitBand] deviceHandle(', this.deviceHandle.address, '): ' , this.deviceHandle.state);

    this.readStepCount(function (err, data) {
      if (err) { self.emit('data', {status: 'error', id : self.id, message: err || 'read error'}); return;}
      result[_.first(FitBand.properties.dataTypes)] = data;
      self.readWeeklyStepCount(function (err, data) {
        if (err) { self.emit('data', {status: 'error', id : self.id, message: err || 'read error'}); return;}
        result.weeklyData = data;
        self.emit('data', {status: 'ok', id: self.id, mac: self.info.device.address, type: 'stepCount', result: result});
      });
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
      logger.debug('[FitBand] W/ deviceHandle('+ self.info.device.address+'):' + self.deviceHandle.state);
      if (self.deviceHandle.state === 'disconnecting'){
        logger.debug('[FitBand] trying to disconnecting('+ self.info.device.address+')');
        self.disconnectTimer = setTimeout(function () {
          logger.debug('disconnect(): disconnecting timed out ' );
          self.disconnectTimer = null;
          self.deviceHandle.state = 'disconnected';
        }, DISCONNECT_TIMEOUT);
        ble.disconnect(self.deviceHandle, function(error){ 
          if (self.disconnectTimer){
            clearTimeout(self.disconnectTimer);
            self.disconnectTimer = null;
          }
          if (error){
            self.emit('error', {id: 'Fitband-'+self.info.device.address, mac: self.info.device.address, message: 'state is disconnecting'});
            return;
          }
          logger.debug('[FitBand] ' + self.info.device.address + ' disconnected');
        });
        return;
      }
    }
    if ( this.info) logger.debug('[FitBand] _get(): trying to getDevice() again: ' +self.info.device.address);
    // scan(search) options
    options = {
      model: this.model,
      serviceUUID : FitBand.properties.ble.service
    };
    ble.getDevice(self.info.device.address, options,function (err, device) {
      if (!err && device) {
        logger.debug('[FitBand] _get(): getDevice().callback() self = ' + util.inspect(self));
        self.deviceHandle = device.deviceHandle[self.info.id];
        self.readStepCount(function (err, data) {
          if (err) { self.emit('data', {status: 'error', id : self.id, message: err || 'read error'}); return;}
          result[_.first(FitBand.properties.dataTypes)] = data;
          self.readWeeklyStepCount(function (err, data) {
            if (err) { self.emit('data', {status: 'error', id : self.id, message: err || 'read error'}); return;}
            result.weeklyData = data;
            self.emit('data', {status: 'ok', id: self.id, mac: self.info.device.address, type: 'stepCount', result: result});
          });
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
      }else if (err && !device){
        self.emit('error', {id: 'Fitband-'+self.info.device.address, mac: self.info.device.address, message: 'not discovered'});
      }

    });
  }
};

module.exports = FitBand;
