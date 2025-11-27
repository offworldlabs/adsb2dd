import {lla2ecef, norm} from '../src/node/geometry.js';
import {enuToEcef, calculateDopplerFromVelocity, calculateWavelength, SPEED_OF_LIGHT} from '../src/node/doppler.js';

describe('Velocity-Based Doppler', () => {
  describe('Wavelength calculation', () => {
    test('calculates correct wavelength for 503 MHz', () => {
      const fc_mhz = 503;
      const wavelength = calculateWavelength(fc_mhz);
      const expected = SPEED_OF_LIGHT / (fc_mhz * 1e6);
      expect(wavelength).toBeCloseTo(expected, 6);
      expect(wavelength).toBeCloseTo(0.596, 3);
    });

    test('calculates correct wavelength for 204.64 MHz', () => {
      const fc_mhz = 204.64;
      const wavelength = calculateWavelength(fc_mhz);
      expect(wavelength).toBeCloseTo(1.465, 3);
    });
  });

  describe('ENU to ECEF transformation', () => {
    test('eastward velocity at equator transforms to +Y in ECEF', () => {
      const vel_e = 100;
      const vel_n = 0;
      const vel_u = 0;
      const lat_rad = 0;
      const lon_rad = 0;

      const vel_ecef = enuToEcef(vel_e, vel_n, vel_u, lat_rad, lon_rad);

      expect(vel_ecef.y).toBeCloseTo(100, 2);
      expect(vel_ecef.x).toBeCloseTo(0, 2);
      expect(vel_ecef.z).toBeCloseTo(0, 2);
    });

    test('northward velocity at equator transforms to +Z in ECEF', () => {
      const vel_e = 0;
      const vel_n = 100;
      const vel_u = 0;
      const lat_rad = 0;
      const lon_rad = 0;

      const vel_ecef = enuToEcef(vel_e, vel_n, vel_u, lat_rad, lon_rad);

      expect(vel_ecef.z).toBeCloseTo(100, 2);
      expect(vel_ecef.x).toBeCloseTo(0, 2);
      expect(vel_ecef.y).toBeCloseTo(0, 2);
    });
  });

  describe('Doppler calculation from velocity', () => {
    test('aircraft moving toward receiver produces measurable Doppler', () => {
      const aircraft = {
        lat: 0,
        lon: 0.05,
        gs: 194.384,
        track: 90,
        geom_rate: 0
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(Math.abs(doppler)).toBeGreaterThan(10);
    });

    test('aircraft on perpendicular track produces near-zero Doppler', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 194.384,
        track: 0,
        geom_rate: 0
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(Math.abs(doppler)).toBeLessThan(10);
    });

    test('vertical velocity produces small Doppler', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 0,
        track: 0,
        geom_rate: 1968.5
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0.1, 0, 0);
      const ecefTx = lla2ecef(-0.1, 0, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(Math.abs(doppler)).toBeLessThan(20);
    });

    test('missing geom_rate defaults to zero vertical velocity', () => {
      const aircraft = {
        lat: 0,
        lon: 0.05,
        gs: 194.384,
        track: 90
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).not.toBeNull();
      expect(Math.abs(doppler)).toBeGreaterThan(10);
    });

    test('returns null when aircraft too close to receiver', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 194.384,
        track: 90
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 0);
      const ecefRx = lla2ecef(0, 0, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = 0.5;
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).toBeNull();
    });

    test('returns null for invalid latitude', () => {
      const aircraft = {
        lat: 91,
        lon: 0,
        gs: 194.384,
        track: 90
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).toBeNull();
    });

    test('returns null for invalid longitude', () => {
      const aircraft = {
        lat: 0,
        lon: 181,
        gs: 194.384,
        track: 90
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).toBeNull();
    });

    test('handles track = 0 (north) correctly', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 194.384,
        track: 0
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0.1, 0, 0);
      const ecefTx = lla2ecef(-0.1, 0, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).not.toBeNull();
    });

    test('returns null for excessive ground speed', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 1500,
        track: 90
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).toBeNull();
    });

    test('returns null for excessive vertical rate', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 194.384,
        track: 90,
        geom_rate: 25000
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).toBeNull();
    });

    test('returns null for invalid altitude', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 194.384,
        track: 90,
        alt_geom: 150000
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).toBeNull();
    });

    test('handles track near 360 degrees correctly', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 194.384,
        track: 359.9
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0.1, 0, 0);
      const ecefTx = lla2ecef(-0.1, 0, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).not.toBeNull();
    });

    test('returns null for track >= 360 degrees', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 194.384,
        track: 360
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).toBeNull();
    });

    test('handles negative vertical rate correctly', () => {
      const aircraft = {
        lat: 0,
        lon: 0,
        gs: 194.384,
        track: 90,
        geom_rate: -3000
      };

      const aircraft_ecef = lla2ecef(aircraft.lat, aircraft.lon, 10000);
      const ecefRx = lla2ecef(0, 0.1, 0);
      const ecefTx = lla2ecef(0, -0.1, 0);

      const dRxTar = norm({x: ecefRx.x - aircraft_ecef.x, y: ecefRx.y - aircraft_ecef.y, z: ecefRx.z - aircraft_ecef.z});
      const dTxTar = norm({x: ecefTx.x - aircraft_ecef.x, y: ecefTx.y - aircraft_ecef.y, z: ecefTx.z - aircraft_ecef.z});

      const fc = 204.64;
      const doppler = calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc);

      expect(doppler).not.toBeNull();
    });
  });
});
