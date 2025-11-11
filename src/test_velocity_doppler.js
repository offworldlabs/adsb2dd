import {lla2ecef, ft2m} from './node/geometry.js';

function enuToEcef(vel_e, vel_n, vel_u, lat_rad, lon_rad) {
  const sin_lat = Math.sin(lat_rad);
  const cos_lat = Math.cos(lat_rad);
  const sin_lon = Math.sin(lon_rad);
  const cos_lon = Math.cos(lon_rad);

  const vx = -sin_lon * vel_e - sin_lat * cos_lon * vel_n + cos_lat * cos_lon * vel_u;
  const vy =  cos_lon * vel_e - sin_lat * sin_lon * vel_n + cos_lat * sin_lon * vel_u;
  const vz =  cos_lat * vel_n + sin_lat * vel_u;

  return {x: vx, y: vy, z: vz};
}

function calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc) {
  const gs_ms = aircraft.gs * 0.514444;
  const track_rad = aircraft.track * Math.PI / 180;

  const vel_east = gs_ms * Math.sin(track_rad);
  const vel_north = gs_ms * Math.cos(track_rad);

  let vel_up = 0;
  if (aircraft.geom_rate !== undefined) {
    vel_up = aircraft.geom_rate * 0.00508;
  }

  const lat_rad = aircraft.lat * Math.PI / 180;
  const lon_rad = aircraft.lon * Math.PI / 180;
  const vel_ecef = enuToEcef(vel_east, vel_north, vel_up, lat_rad, lon_rad);

  const vec_to_rx = {
    x: (ecefRx.x - aircraft_ecef.x) / dRxTar,
    y: (ecefRx.y - aircraft_ecef.y) / dRxTar,
    z: (ecefRx.z - aircraft_ecef.z) / dRxTar
  };

  const vec_to_tx = {
    x: (ecefTx.x - aircraft_ecef.x) / dTxTar,
    y: (ecefTx.y - aircraft_ecef.y) / dTxTar,
    z: (ecefTx.z - aircraft_ecef.z) / dTxTar
  };

  const range_rate_rx = vel_ecef.x * vec_to_rx.x +
                        vel_ecef.y * vec_to_rx.y +
                        vel_ecef.z * vec_to_rx.z;

  const range_rate_tx = vel_ecef.x * vec_to_tx.x +
                        vel_ecef.y * vec_to_tx.y +
                        vel_ecef.z * vec_to_tx.z;

  const bistatic_range_rate = range_rate_rx + range_rate_tx;
  const wavelength = 299792458 / (fc * 1000000);
  const doppler = -bistatic_range_rate / wavelength;

  return doppler;
}

function norm(vec) {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

function runTests() {
  console.log('='.repeat(60));
  console.log('Velocity-Based Doppler Unit Tests');
  console.log('='.repeat(60));

  let passCount = 0;
  let totalTests = 0;

  totalTests++;
  console.log(`\nTest 1: ENU to ECEF transformation at equator`);
  {
    const vel_e = 100;
    const vel_n = 0;
    const vel_u = 0;
    const lat_rad = 0;
    const lon_rad = 0;

    const vel_ecef = enuToEcef(vel_e, vel_n, vel_u, lat_rad, lon_rad);

    console.log(`  Input: vel_east=${vel_e} m/s, vel_north=${vel_n} m/s at (lat=0, lon=0)`);
    console.log(`  Output ECEF: vx=${vel_ecef.x.toFixed(2)}, vy=${vel_ecef.y.toFixed(2)}, vz=${vel_ecef.z.toFixed(2)}`);

    if (Math.abs(vel_ecef.y - 100) < 0.01 && Math.abs(vel_ecef.x) < 0.01 && Math.abs(vel_ecef.z) < 0.01) {
      console.log('  ✓ PASS: Eastward velocity at equator correctly transforms to +Y in ECEF');
      passCount++;
    } else {
      console.log('  ✗ FAIL: Expected vy≈100, vx≈0, vz≈0');
    }
  }

  totalTests++;
  console.log(`\nTest 2: ENU to ECEF transformation - northward at equator`);
  {
    const vel_e = 0;
    const vel_n = 100;
    const vel_u = 0;
    const lat_rad = 0;
    const lon_rad = 0;

    const vel_ecef = enuToEcef(vel_e, vel_n, vel_u, lat_rad, lon_rad);

    console.log(`  Input: vel_east=${vel_e} m/s, vel_north=${vel_n} m/s at (lat=0, lon=0)`);
    console.log(`  Output ECEF: vx=${vel_ecef.x.toFixed(2)}, vy=${vel_ecef.y.toFixed(2)}, vz=${vel_ecef.z.toFixed(2)}`);

    if (Math.abs(vel_ecef.z - 100) < 0.01 && Math.abs(vel_ecef.x) < 0.01 && Math.abs(vel_ecef.y) < 0.01) {
      console.log('  ✓ PASS: Northward velocity at equator correctly transforms to +Z in ECEF');
      passCount++;
    } else {
      console.log('  ✗ FAIL: Expected vz≈100, vx≈0, vy≈0');
    }
  }

  totalTests++;
  console.log(`\nTest 3: Aircraft moving toward receiver`);
  {
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

    console.log(`  Aircraft: gs=${aircraft.gs} knots (100 m/s), track=${aircraft.track}° (east)`);
    console.log(`  Aircraft at 0.05° east, RX at 0.1° east, TX at 0.1° west`);
    console.log(`  Doppler: ${doppler.toFixed(2)} Hz`);

    if (Math.abs(doppler) > 10) {
      console.log('  ✓ PASS: Doppler is measurable (|doppler| > 10 Hz)');
      passCount++;
    } else {
      console.log('  ✗ FAIL: Expected measurable Doppler with |doppler| > 10 Hz');
    }
  }

  totalTests++;
  console.log(`\nTest 4: Aircraft on perpendicular track (near-zero Doppler)`);
  {
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

    console.log(`  Aircraft: gs=${aircraft.gs} knots (100 m/s), track=${aircraft.track}° (north)`);
    console.log(`  RX at 0.1° east, TX at 0.1° west (perpendicular to motion)`);
    console.log(`  Doppler: ${doppler.toFixed(2)} Hz`);

    if (Math.abs(doppler) < 10) {
      console.log('  ✓ PASS: Doppler is near zero for perpendicular motion');
      passCount++;
    } else {
      console.log('  ✗ FAIL: Expected |doppler| < 10 Hz for perpendicular track');
    }
  }

  totalTests++;
  console.log(`\nTest 5: Vertical velocity contribution`);
  {
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

    console.log(`  Aircraft: gs=0 knots, geom_rate=${aircraft.geom_rate} ft/min (10 m/s up)`);
    console.log(`  RX north, TX south (baseline perpendicular to vertical)`);
    console.log(`  Doppler: ${doppler.toFixed(2)} Hz`);

    if (Math.abs(doppler) < 20) {
      console.log('  ✓ PASS: Vertical velocity produces small Doppler (geometry dependent)');
      passCount++;
    } else {
      console.log('  ✗ FAIL: Expected relatively small Doppler from vertical motion');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Test Summary: ${passCount}/${totalTests} passed`);
  console.log('='.repeat(60));

  if (passCount === totalTests) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log(`\n✗ ${totalTests - passCount} test(s) failed`);
    process.exit(1);
  }
}

runTests();
