/**
 * Fastgo Fitband specific data
 */

var assert = require('assert'),
    util = require('util'),
    _ = require("lodash");
var logger = require('log4js').getLogger('band');

var OPCODE_READ_CURRENT_TIME = 0x89;
var OPCODE_WRITE_CURRENT_TIME = 0xC2;
var OPCODE_CURRENT_STEPS = 0xc6;
var RESPONSE_CURRENT_TIME = 0x29;
var HANDLE_READ_BATTERY = 0x0036;
var HANDLE_SET_NOTIFICATION = 0x0053;

var readSegmentData = function (buf, idx, segmentLen){
  'use strict';
  var data = _.reduceRight(buf.slice(idx, idx + segmentLen), function(result, byteValue, index){
        return result + (byteValue << ((segmentLen - 1 -index) * 8));
      });
  return data;
};

/**
 * bitwise xor checksum
 */
var checksum = function(buffer){
  'use strict';
  var len = buffer.readUInt8(0); // read length of buffer data
  var checksum = _.reduce(buffer.slice(1, 1 + len), function(result, byteValue, index){
      return result ^ byteValue;
  });
  return checksum;
};

/**
 * make current time into buffer data
 * @return Buffer
 */
var makeTime = function(){
  'use strict';
  var timeDataLen = 0x07;
  var currentTime = new Date();
  var year = currentTime.getFullYear() ;
  var month = currentTime.getMonth();
  var date = currentTime.getDate();
  var hours = currentTime.getHours();
  var minutes = currentTime.getMinutes();
  var seconds = currentTime.getSeconds();
  var milliseconds = currentTime.getMilliseconds();
  var dayOfWeek = currentTime.getDay();
  dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
  var checksum = year-2000 ^ month ^ date ^ hours ^ minutes ^ seconds ^ dayOfWeek;
  var buf = new Buffer([timeDataLen, year-2000, month, date, hours, minutes, seconds, dayOfWeek, 0x00]); // append checksum byte
  buf[timeDataLen] = checksum(buf);
  return buf;
};

/**
 * convert buffer that include time date into millis
 * @return time in millis
 */
var parseDate = function(buf){
  'use strict';
  var idx = 0;
  var res = buf.readUInt8(idx++);
  assert.equal(res, RESPONSE_CURRENT_TIME);
  var len = buf.readUInt8(idx++);
  assert.equal(len, 7);
  var year = buf.readUInt8(idx++) + 2000;
  var month = buf.readUInt8(idx++);
  var day = buf.readUInt8(idx++);
  var hour = buf.readUInt8(idx++);
  var minute = buf.readUInt8(idx++);
  var second = buf.readUInt8(idx++);
  var dayOfWeek = buf.readUInt8(idx++);
  logger.debug(year + '년 ' +  month + '월 ' + day + '일 ' + hour + '시' );
  var date = new Date(year, month - 1, day, hour, minute, second, 0);
  logger.debug(date);
  if ((dayOfWeek % 7) !== date.getDay()){
    logger.error('dayOfWeek : ' + dayOfWeek);
    logger.error('getDay() : ' + date.getDay());
    return {'status' : 'error', 'message': 'day of week is not correct'};
  }
  return { 'date' : date, 'status': 'ok' };
};

var isStepCount = function isStepCount(data){
  return data.length > 4;
};

var processData = function(buf){
    var idx = 0;
    var res = buf.readUInt8(idx++);
    logger.debug("buffer length = %d", buf.length);
    logger.debug("response = 0x" + res.toString(16));
    var len = buf.readUInt8(idx++);
    if (res == 0x26){ // 요일별 활동량
      assert.equal(len, 9);
      var segmentLen = 3;
      var steps = readSegmentData(buf, idx, segmentLen);
      idx += 3;
      logger.debug("steps = " + steps);
      var calorie= readSegmentData(buf, idx, segmentLen);
      idx += 3;
      var kilos= readSegmentData(buf, idx, segmentLen);
      idx += 3;
      var checksum = buf.readUInt8(idx);
      logger.debug("checksum = " + len.toString(16));
      return steps;
    }else if (res === 0x29){  // read system time positive response
      return parseDate(buf);
    }else if (res === 0x22){  // set system time positive response
      return { 'status' : 'ok'}; // response에는 의미있는 데이터가 없음 
    }else if (res === 0x06){  // negative response for read device data
      return null;
    }else {
      return null;
    }
};

module.exports = {
  OPCODE_READ_CURRENT_TIME : OPCODE_READ_CURRENT_TIME,
  OPCODE_WRITE_CURRENT_TIME : OPCODE_WRITE_CURRENT_TIME,
  OPCODE_CURRENT_STEPS : OPCODE_CURRENT_STEPS,
  RESPONSE_CURRENT_TIME : RESPONSE_CURRENT_TIME,

  checksum : checksum,
  makeTime : makeTime,
  parseDate : parseDate,
  isStepCount : isStepCount,
  processData : processData
};
