/**
 * Fastgo Fitband specific data
 */

'use strict';

var assert = require('assert'),
    util = require('util'),
    _ = require("lodash");
var logger = require('../../../config/environment').getLogger();

var OPCODE_CURRENT_TIME = 0x89;
var OPCODE_CURRENT_STEPS = 0xc6;
var RESPONSE_CURRENT_TIME = 0x29;
var HANDLE_READ_BATTERY = 0x0036;
var HANDLE_SET_NOTIFICATION = 0x0053;

var readSegmentData = function (buf, idx, segmentLen){
  var data = _.reduceRight(buf.slice(idx, idx + segmentLen), function(result, byteValue, index){
        return result + (byteValue << ((segmentLen - 1 -index) * 8));
      });
  return data;
};

/**
 * bitwise xor checksum
 */
var checksum = function(buffer){
  var len = buffer.readUInt8(0); // read length of buffer data
  var checksum = _.reduce(buffer.slice(1, 1 + len), function(result, byteValue, index){
      return result ^ byteValue;
  });
  return checksum;
}

/**
 * make current time into buffer data
 * @return Buffer
 */
var makeTime = function(){
    var timeDataLen = 0x07;
    var currentTime = _.now();
    var year = currentTime.getFullYear() ;
    var month = currentTime.getMonth();
    var date = currentTime.getDate();
    var hours = currentTime.getHours();
    var minutes = currentTime.getMinutes();
    var seconds = currentTime.getSeconds();
    var milliseconds = currentTime.getMilliseconds();
    var dayOfWeek = currentTime.getDay();
    var buf = new Buffer([timeDataLen, year-2000, month, date, hours, minutes, seconds, dayOfWeek, 0x00]); // append checksum byte
    buf[timeDateLen] = checksum(buf);
    return buf;
};

/**
 * convert buffer that include time date into millis
 * @return time in millis
 */
var timeInMillis = function(buf){
    var idx = 0;
    var res = buf.readUInt8(idx++);
    assert.equal(res, RESPONSE_CURRENT_TIME);
    var len = buf.readUInt8(idx++);
    assert.equals(len, 7);
    var year = buf.readUInt8(idx++) + 2000;
    var month = buf.readUInt8(idx++);
    var day = buf.readUInt8(idx++);
    var hour = buf.readUInt8(idx++);
    var minute = buf.readUInt8(idx++);
    var second = buf.readUInt8(idx++);
    var date = new Date(year, month, day, hour, minute, second, 0);
    logger.debug('date: ' + date);
    return date.getTime();
};

var isStepCount = function isStepCount(data){
  return data.length > 4;
}

module.exports = {
  OPCODE_CURRENT_TIME : OPCODE_CURRENT_TIME,
  OPCODE_CURRENT_STEPS : OPCODE_CURRENT_STEPS,
  RESPONSE_CURRENT_TIME : RESPONSE_CURRENT_TIME,

  checksum : checksum,
  makeTime : makeTime,
  timeInMillis : timeInMillis,
  isStepCount : isStepCount,
  processData : function(buf){
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
      logger.debug("steps = 0x" + steps.toString(16));
      var calorie= readSegmentData(buf, idx, segmentLen);
      idx += 3;
      //logger.debug("calorie= 0x" + calorie.toString(16));
      var kilos= readSegmentData(buf, idx, segmentLen);
      idx += 3;
      //logger.debug("kilos= 0x" + kilos.toString(16));
      var checksum = buf.readUInt8(idx);
      logger.debug("checksum = " + len.toString(16));
      /*
      var body = {
        text: "오늘 총걸음수는 " + steps+ "걸음 입니다.\n"  +
              "오늘 소모한 총칼로리는 " + calorie+ "칼로리 입니다.\n"  +
              "오늘 총 걸은 거리는 " + kilos+ "km 입니다.\n",
        username : 'wooks123kr'
      };
      */
      return steps;
    }else{
      return null;
    }
  }
}
