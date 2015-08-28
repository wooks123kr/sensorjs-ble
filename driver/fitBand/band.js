/**
 * Fastgo Fitband specific data
 */

'use strict';

var assert = require('assert');
var util = require('util');
var _ = require("lodash");

var readSegmentData = function (buf, idx, segmentLen){
  var data = _.reduceRight(buf.slice(idx, idx + segmentLen), function(result, byteValue, index){
        return result + (byteValue << ((segmentLen - 1 -index) * 8));
      });
  return data;
};

module.exports = {
  processData : function(buf){
    var idx = 0;
    var res = buf.readUInt8(idx++);
    console.log("buffer length = %d", buf.length);
    console.log("response = 0x" + res.toString(16));
    if (res == 0x26){ // 요일별 활동량 
      var len = buf.readUInt8(idx++);
      assert.equal(len, 9);
      var segmentLen = 3;
      var steps = readSegmentData(buf, idx, segmentLen);
      idx += 3;
      console.log("steps = 0x" + steps.toString(16));
      var calorie= readSegmentData(buf, idx, segmentLen);
      idx += 3;
      console.log("calorie= 0x" + calorie.toString(16));
      var kilos= readSegmentData(buf, idx, segmentLen);
      idx += 3;
      console.log("kilos= 0x" + kilos.toString(16));
      var checksum = buf.readUInt8(idx);
      console.log("checksum = " + len.toString(16));
      var body = {
        text: "월요일 총걸음수는 " + steps+ "입니다.\n"  + 
              "월요일 총칼로리는 " + calorie+ "입니다.\n"  + 
              "월요일 거리는 " + kilos+ "입니다.\n", 
        username : 'wooks123kr'
      };
      return steps;
    }else{
      return null;
    }
  }
}
