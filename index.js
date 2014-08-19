'use strict';

function initNetworks() {
  var bleNetwork;

  try {
    bleNetwork = require('./network/ble');
  } catch (e) {
    console.error('[ble] init networks error', e);
  }

  return {
    ble: bleNetwork
  };
}

function initDrivers() {
  var sensorTagAcc, sensorTagHum, sensorTagWobble;

  try {
    sensorTagAcc = require('./driver/sensorTagAcc');
    sensorTagHum = require('./driver/sensorTagHum');
    sensorTagWobble = require('./driver/sensorTagWobble');
  } catch(e) {
    console.error('[ble] init drivers error', e);
  }

  return {
    sensorTagAcc: sensorTagAcc,
    sensorTagHum: sensorTagHum,
    sensorTagWobble: sensorTagWobble
  };
}

module.exports = {
  networks: ['ble'],
  drivers: {
    sensorTagAcc: ['sensorTagAcc'],
    sensorTagHum: ['sensorTagHum'],
    sensorTagWobble: ['sensorTagWobble']
  },
  initNetworks: initNetworks,
  initDrivers: initDrivers
};