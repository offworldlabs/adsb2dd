export const KNOTS_TO_MS = 0.514444;
export const FTMIN_TO_MS = 0.00508;
export const SPEED_OF_LIGHT = 299792458;
export const MHZ_TO_HZ = 1e6;
export const MIN_VALID_DISTANCE_M = 100;
export const MAX_GROUND_SPEED_KNOTS = 1000;
export const MAX_VERTICAL_RATE_FTMIN = 20000;
export const MIN_ALTITUDE_FT = -1000;
export const MAX_ALTITUDE_FT = 100000;

/// @brief Calculate wavelength from frequency
/// @param fc Carrier frequency in MHz (API converts Hz to MHz before calling)
/// @return Wavelength in meters
export function calculateWavelength(fc) {
  return SPEED_OF_LIGHT / (fc * MHZ_TO_HZ);
}

/// @brief Convert ENU velocity to ECEF velocity
/// @param vel_e East component of velocity (m/s)
/// @param vel_n North component of velocity (m/s)
/// @param vel_u Up component of velocity (m/s)
/// @param lat_rad Latitude in radians
/// @param lon_rad Longitude in radians
/// @return ECEF velocity vector {x, y, z}
export function enuToEcef(vel_e, vel_n, vel_u, lat_rad, lon_rad) {
  const sin_lat = Math.sin(lat_rad);
  const cos_lat = Math.cos(lat_rad);
  const sin_lon = Math.sin(lon_rad);
  const cos_lon = Math.cos(lon_rad);

  const vx = -sin_lon * vel_e - sin_lat * cos_lon * vel_n + cos_lat * cos_lon * vel_u;
  const vy =  cos_lon * vel_e - sin_lat * sin_lon * vel_n + cos_lat * sin_lon * vel_u;
  const vz =  cos_lat * vel_n + sin_lat * vel_u;

  return {x: vx, y: vy, z: vz};
}

/// @brief Calculate bistatic Doppler from velocity data
/// @param aircraft Aircraft object with gs, track, and optionally geom_rate
/// @param aircraft_ecef Aircraft position in ECEF
/// @param ecefRx Receiver position in ECEF
/// @param ecefTx Transmitter position in ECEF
/// @param dRxTar Distance from receiver to aircraft (meters)
/// @param dTxTar Distance from transmitter to aircraft (meters)
/// @param fc Carrier frequency in Hz
/// @return Doppler shift in Hz, or null if velocity data unavailable
export function calculateDopplerFromVelocity(aircraft, aircraft_ecef, ecefRx, ecefTx, dRxTar, dTxTar, fc) {
  if (aircraft.gs === undefined || aircraft.track === undefined ||
      isNaN(aircraft.gs) || isNaN(aircraft.track)) {
    return null;
  }

  if (aircraft.gs < 0 || aircraft.gs > MAX_GROUND_SPEED_KNOTS) {
    return null;
  }

  if (aircraft.track < 0 || aircraft.track >= 360) {
    return null;
  }

  if (dRxTar < MIN_VALID_DISTANCE_M || dTxTar < MIN_VALID_DISTANCE_M) {
    return null;
  }

  if (aircraft.lat < -90 || aircraft.lat > 90 ||
      aircraft.lon < -180 || aircraft.lon > 180) {
    return null;
  }

  if (aircraft.alt_geom !== undefined &&
      (aircraft.alt_geom < MIN_ALTITUDE_FT || aircraft.alt_geom > MAX_ALTITUDE_FT)) {
    return null;
  }

  if (aircraft.geom_rate !== undefined && !isNaN(aircraft.geom_rate) &&
      Math.abs(aircraft.geom_rate) > MAX_VERTICAL_RATE_FTMIN) {
    return null;
  }

  const gs_ms = aircraft.gs * KNOTS_TO_MS;
  const track_rad = aircraft.track * Math.PI / 180;

  const vel_east = gs_ms * Math.sin(track_rad);
  const vel_north = gs_ms * Math.cos(track_rad);

  let vel_up = 0;
  if (aircraft.geom_rate !== undefined && !isNaN(aircraft.geom_rate)) {
    vel_up = aircraft.geom_rate * FTMIN_TO_MS;
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

  const range_rate_rx = -(vel_ecef.x * vec_to_rx.x +
                          vel_ecef.y * vec_to_rx.y +
                          vel_ecef.z * vec_to_rx.z);

  const range_rate_tx = -(vel_ecef.x * vec_to_tx.x +
                          vel_ecef.y * vec_to_tx.y +
                          vel_ecef.z * vec_to_tx.z);

  const bistatic_range_rate = range_rate_rx + range_rate_tx;
  const wavelength = calculateWavelength(fc);
  const doppler = -bistatic_range_rate / wavelength;

  return doppler;
}
