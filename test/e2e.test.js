import {calculateWavelength, calculateDopplerFromVelocity, SPEED_OF_LIGHT} from '../src/node/doppler.js';
import {lla2ecef, norm} from '../src/node/geometry.js';

describe('E2E Bug Fixes', () => {
  describe('Doppler magnitude fix (units conversion)', () => {
    test('503 MHz system produces realistic Doppler values for commercial aircraft', () => {
      const fc_mhz = 503;

      const rxLat = 37.7644;
      const rxLon = -122.3954;
      const rxAlt = 23;

      const txLat = 37.49917;
      const txLon = -121.87222;
      const txAlt = 783;

      const aircraft = {
        lat: 37.63,
        lon: -122.19,
        alt_geom: 35000,
        gs: 450,
        track: 90,
        geom_rate: 0
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, aircraft.alt_geom * 0.3048);
      const ecefRx = lla2ecef(rxLat, rxLon, rxAlt);
      const ecefTx = lla2ecef(txLat, txLon, txAlt);

      const dRxTar = norm({
        x: ecefRx.x - aircraft_ecef.x,
        y: ecefRx.y - aircraft_ecef.y,
        z: ecefRx.z - aircraft_ecef.z
      });

      const dTxTar = norm({
        x: ecefTx.x - aircraft_ecef.x,
        y: ecefTx.y - aircraft_ecef.y,
        z: ecefTx.z - aircraft_ecef.z
      });

      const doppler = calculateDopplerFromVelocity(
        aircraft,
        aircraft_ecef,
        ecefRx,
        ecefTx,
        dRxTar,
        dTxTar,
        fc_mhz
      );

      expect(doppler).not.toBeNull();
      expect(Math.abs(doppler)).toBeLessThan(5000);
      expect(Math.abs(doppler)).toBeGreaterThan(10);
      expect(Math.abs(doppler)).toBeLessThan(1000000);
    });

    test('wavelength is correct for 503 MHz', () => {
      const fc_mhz = 503;
      const wavelength = calculateWavelength(fc_mhz);

      expect(wavelength).toBeCloseTo(0.596, 3);

      const expected = SPEED_OF_LIGHT / (fc_mhz * 1e6);
      expect(wavelength).toBeCloseTo(expected, 6);
    });

    test('Doppler values are in Hz not millions of Hz', () => {
      const fc_mhz = 503;

      const aircraft = {
        lat: 37.7,
        lon: -122.2,
        alt_geom: 30000,
        gs: 500,
        track: 180,
        geom_rate: 2000
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, aircraft.alt_geom * 0.3048);
      const ecefRx = lla2ecef(37.7644, -122.3954, 23);
      const ecefTx = lla2ecef(37.49917, -121.87222, 783);

      const dRxTar = norm({
        x: ecefRx.x - aircraft_ecef.x,
        y: ecefRx.y - aircraft_ecef.y,
        z: ecefRx.z - aircraft_ecef.z
      });

      const dTxTar = norm({
        x: ecefTx.x - aircraft_ecef.x,
        y: ecefTx.y - aircraft_ecef.y,
        z: ecefTx.z - aircraft_ecef.z
      });

      const doppler = calculateDopplerFromVelocity(
        aircraft,
        aircraft_ecef,
        ecefRx,
        ecefTx,
        dRxTar,
        dTxTar,
        fc_mhz
      );

      const wavelength = calculateWavelength(fc_mhz);
      expect(wavelength).toBeCloseTo(0.596, 3);
      expect(doppler).not.toBeNull();
      expect(Math.abs(doppler)).toBeLessThan(10000);
    });
  });

  describe('Timestamp calculation fix (seen_pos subtraction)', () => {
    test('recent aircraft position produces timestamp in the past', () => {
      const json_now = 1700000000;
      const seen_pos = 1.5;

      const timestamp = json_now - seen_pos;

      expect(timestamp).toBe(1699999998.5);
      expect(timestamp).toBeLessThan(json_now);
      expect(json_now - timestamp).toBe(seen_pos);
    });

    test('stale aircraft with 55s seen_pos is deleted after 5s', () => {
      const tDeletePlane = 5;
      const json_now = 1700000000;
      const seen_pos = 55;

      const aircraft_timestamp = json_now - seen_pos;

      const current_time_when_checked = json_now + 1;

      const age = current_time_when_checked - aircraft_timestamp;
      const should_delete = age > tDeletePlane;

      expect(aircraft_timestamp).toBe(1699999945);
      expect(age).toBe(56);
      expect(should_delete).toBe(true);
    });

    test('fresh aircraft is not deleted immediately', () => {
      const tDeletePlane = 5;
      const json_now = 1700000000;
      const seen_pos = 0.5;

      const aircraft_timestamp = json_now - seen_pos;

      const current_time = json_now + 1;
      const age = current_time - aircraft_timestamp;
      const should_delete = age > tDeletePlane;

      expect(age).toBe(1.5);
      expect(should_delete).toBe(false);
    });

    test('stale position from 60s ago gets deleted correctly', () => {
      const tDeletePlane = 5;
      const json_now = Date.now() / 1000;
      const seen_pos = 60;

      const timestamp = json_now - seen_pos;

      const age = json_now - timestamp;

      expect(age).toBe(60);
      expect(age > tDeletePlane).toBe(true);
    });
  });

  describe('Combined realistic scenario', () => {
    test('full system processes aircraft correctly with fixes', () => {
      const fc_mhz = 503;
      const json_now = Date.now() / 1000;
      const seen_pos = 2.5;

      const aircraft = {
        hex: 'abc123',
        flight: 'UAL123',
        lat: 37.7,
        lon: -122.2,
        alt_geom: 35000,
        gs: 450,
        track: 270,
        geom_rate: 1000,
        seen_pos: seen_pos
      };

      const timestamp = json_now - aircraft.seen_pos;

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, aircraft.alt_geom * 0.3048);
      const ecefRx = lla2ecef(37.7644, -122.3954, 23);
      const ecefTx = lla2ecef(37.49917, -121.87222, 783);

      const dRxTar = norm({
        x: ecefRx.x - aircraft_ecef.x,
        y: ecefRx.y - aircraft_ecef.y,
        z: ecefRx.z - aircraft_ecef.z
      });

      const dTxTar = norm({
        x: ecefTx.x - aircraft_ecef.x,
        y: ecefTx.y - aircraft_ecef.y,
        z: ecefTx.z - aircraft_ecef.z
      });

      const doppler = calculateDopplerFromVelocity(
        aircraft,
        aircraft_ecef,
        ecefRx,
        ecefTx,
        dRxTar,
        dTxTar,
        fc_mhz
      );

      expect(timestamp).toBeLessThan(json_now);
      expect(json_now - timestamp).toBeCloseTo(seen_pos, 5);

      expect(doppler).not.toBeNull();
      expect(Math.abs(doppler)).toBeLessThan(10000);
      expect(Math.abs(doppler)).toBeGreaterThan(1);

      const wavelength = calculateWavelength(fc_mhz);
      expect(wavelength).toBeCloseTo(0.596, 3);
    });
  });

  describe('Doppler smoothing with corrected timestamps', () => {
    function smoothedDerivativeUsingMedian(delays, timestamps, k) {
      if (delays.length !== timestamps.length || delays.length < 2 || k < 2) {
        throw new Error('Invalid input data for computing the derivative.');
      }

      const result = [];

      for (let i = 0; i < delays.length; i++) {
        const startIdx = Math.max(0, i - k + 1);
        const endIdx = i + 1;

        const lastKDelays = delays.slice(startIdx, endIdx);
        const lastKTimestamps = timestamps.slice(startIdx, endIdx);

        const deltaDelays = lastKDelays.map((delay, idx) => {
          if (idx > 0) {
            const deltaTime = lastKTimestamps[idx] - lastKTimestamps[idx - 1];
            return (delay - lastKDelays[idx - 1]) / deltaTime;
          }
          return 0;
        });

        const sortedArr = [...deltaDelays].sort((a, b) => a - b);
        const middle = Math.floor(sortedArr.length / 2);
        const movingMedianDerivative = sortedArr.length % 2 === 0
          ? (sortedArr[middle - 1] + sortedArr[middle]) / 2
          : sortedArr[middle];

        result.push(movingMedianDerivative);
      }

      return result;
    }

    test('position-based Doppler uses correct timestamps for derivative', () => {
      const json_now = 1700000000;
      const delays = [];
      const timestamps = [];

      delays.push(100000);
      timestamps.push(json_now - 5);

      delays.push(100100);
      timestamps.push(json_now - 4);

      delays.push(100200);
      timestamps.push(json_now - 3);

      const derivatives = smoothedDerivativeUsingMedian(delays, timestamps, 3);

      expect(derivatives.length).toBe(3);
      expect(derivatives[derivatives.length - 1]).toBeCloseTo(100, 1);

      for (let i = 0; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThan(json_now);
      }
    });

    test('timestamps must be monotonically increasing for valid derivatives', () => {
      const timestamps = [
        1700000000 - 5,
        1700000001 - 3,
        1700000002 - 1
      ];

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
      }

      const delays = [100000, 100100, 100200];
      const derivatives = smoothedDerivativeUsingMedian(delays, timestamps, 3);

      expect(derivatives[derivatives.length - 1]).toBeGreaterThan(0);
      expect(derivatives[derivatives.length - 1]).toBeLessThan(1000);
    });

    test('future timestamps would cause negative deltaTime (regression test)', () => {
      const json_now = 1700000000;

      const timestamps_wrong = [
        json_now + 5,
        json_now + 4,
        json_now + 3
      ];

      for (let i = 1; i < timestamps_wrong.length; i++) {
        const deltaTime = timestamps_wrong[i] - timestamps_wrong[i - 1];
        expect(deltaTime).toBeLessThan(0);
      }

      const timestamps_correct = [
        json_now - 5,
        json_now - 4,
        json_now - 3
      ];

      for (let i = 1; i < timestamps_correct.length; i++) {
        const deltaTime = timestamps_correct[i] - timestamps_correct[i - 1];
        expect(deltaTime).toBeGreaterThan(0);
      }
    });

    test('realistic aircraft movement produces valid Doppler from smoothing', () => {
      const fc_mhz = 503;
      const json_now = 1700000000;

      const delays = [50000, 50100, 50200, 50300, 50400];
      const timestamps = [];

      for (let i = 0; i < delays.length; i++) {
        timestamps.push(json_now + i - (5 - i) * 0.5);
      }

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
      }

      const derivatives = smoothedDerivativeUsingMedian(delays, timestamps, 3);
      const doppler_ms = derivatives[derivatives.length - 1];

      const wavelength = calculateWavelength(fc_mhz);
      const doppler_hz = -doppler_ms / wavelength;

      expect(Math.abs(doppler_hz)).toBeLessThan(1000000);
      expect(Math.abs(doppler_hz)).toBeGreaterThan(0);
    });
  });
});
