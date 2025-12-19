/// @file Synthetic detection generation with configurable noise
/// @brief Utilities for generating realistic radar detections with noise/imperfections

import seedrandom from 'seedrandom';

/// @brief Random number generator with various distributions
export class SyntheticRNG {
  constructor(seed) {
    this.rng = seedrandom(seed !== undefined ? seed : Date.now().toString());
  }

  /// @brief Generate uniform random number in [min, max]
  uniform(min, max) {
    return min + this.rng() * (max - min);
  }

  /// @brief Generate Gaussian (normal) random number using Box-Muller transform
  /// @param mean Mean of distribution
  /// @param std Standard deviation
  /// @return Random number from N(mean, std^2)
  gaussian(mean = 0, std = 1) {
    const u1 = this.rng();
    const u2 = this.rng();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }

  /// @brief Generate Poisson random variable
  /// @param lambda Expected value (rate parameter)
  /// @return Random integer from Poisson(lambda)
  poisson(lambda) {
    if (lambda <= 0) return 0;

    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;

    do {
      k++;
      p *= this.rng();
    } while (p > L);

    return k - 1;
  }

  /// @brief Bernoulli trial (coin flip with probability p)
  /// @param p Probability of success [0-1]
  /// @return true with probability p
  bernoulli(p) {
    return this.rng() < p;
  }
}

/// @brief Default configuration for synthetic detection generation
export const DEFAULT_SYNTHETIC_CONFIG = {
  noise_delay: 0.5,           // Delay noise std (km)
  noise_doppler: 2.0,         // Doppler noise std (Hz)
  snr_min: 8,                 // Minimum SNR (dB)
  snr_max: 20,                // Maximum SNR (dB)
  detection_prob: 0.95,       // Probability of detecting aircraft [0-1]
  false_alarm_rate: 0.5,      // False alarms per frame
  frame_interval: 500,        // Frame interval (ms)
  duration: 10,               // Total duration (seconds)
  delay_min: 0,               // Min delay for false alarms (km)
  delay_max: 400,             // Max delay for false alarms (km)
  doppler_min: -200,          // Min Doppler for false alarms (Hz)
  doppler_max: 200            // Max Doppler for false alarms (Hz)
};

export const MAX_FRAMES = 1000;
export const MAX_DURATION_SECONDS = 300;

/// @brief Parse synthetic configuration from query parameters
/// @param query Express query object
/// @return Configuration object with defaults applied
export function parseSyntheticConfig(query) {
  const config = { ...DEFAULT_SYNTHETIC_CONFIG };

  const parseAndValidate = (value, type = 'float') => {
    const parsed = type === 'int' ? parseInt(value) : parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  };

  if (query.noise_delay !== undefined) {
    const val = parseAndValidate(query.noise_delay);
    if (val !== null) config.noise_delay = val;
  }
  if (query.noise_doppler !== undefined) {
    const val = parseAndValidate(query.noise_doppler);
    if (val !== null) config.noise_doppler = val;
  }
  if (query.snr_min !== undefined) {
    const val = parseAndValidate(query.snr_min);
    if (val !== null) config.snr_min = val;
  }
  if (query.snr_max !== undefined) {
    const val = parseAndValidate(query.snr_max);
    if (val !== null) config.snr_max = val;
  }
  if (query.detection_prob !== undefined) {
    const val = parseAndValidate(query.detection_prob);
    if (val !== null) config.detection_prob = val;
  }
  if (query.false_alarm_rate !== undefined) {
    const val = parseAndValidate(query.false_alarm_rate);
    if (val !== null) config.false_alarm_rate = val;
  }
  if (query.frame_interval !== undefined) {
    const val = parseAndValidate(query.frame_interval, 'int');
    if (val !== null) config.frame_interval = val;
  }
  if (query.duration !== undefined) {
    const val = parseAndValidate(query.duration);
    if (val !== null) config.duration = val;
  }
  if (query.delay_min !== undefined) {
    const val = parseAndValidate(query.delay_min);
    if (val !== null) config.delay_min = val;
  }
  if (query.delay_max !== undefined) {
    const val = parseAndValidate(query.delay_max);
    if (val !== null) config.delay_max = val;
  }
  if (query.doppler_min !== undefined) {
    const val = parseAndValidate(query.doppler_min);
    if (val !== null) config.doppler_min = val;
  }
  if (query.doppler_max !== undefined) {
    const val = parseAndValidate(query.doppler_max);
    if (val !== null) config.doppler_max = val;
  }
  if (query.seed !== undefined) {
    config.seed = query.seed;
  }

  return config;
}

/// @brief Validate synthetic configuration
/// @param config Configuration object
/// @return Object with {valid: boolean, errors: string[]}
export function validateSyntheticConfig(config) {
  const errors = [];

  if (config.noise_delay < 0) {
    errors.push('noise_delay must be non-negative');
  }
  if (config.noise_doppler < 0) {
    errors.push('noise_doppler must be non-negative');
  }
  if (config.snr_min > config.snr_max) {
    errors.push('snr_min must be <= snr_max');
  }
  if (config.detection_prob < 0 || config.detection_prob > 1) {
    errors.push('detection_prob must be in [0, 1]');
  }
  if (config.false_alarm_rate < 0) {
    errors.push('false_alarm_rate must be non-negative');
  }
  if (config.frame_interval <= 0) {
    errors.push('frame_interval must be positive');
  }
  if (config.duration <= 0) {
    errors.push('duration must be positive');
  }
  if (config.duration > MAX_DURATION_SECONDS) {
    errors.push(`duration must be <= ${MAX_DURATION_SECONDS} seconds`);
  }
  if (config.delay_min >= config.delay_max) {
    errors.push('delay_min must be < delay_max');
  }
  if (config.doppler_min >= config.doppler_max) {
    errors.push('doppler_min must be < doppler_max');
  }

  const nFrames = Math.ceil((config.duration * 1000) / config.frame_interval);
  if (nFrames > MAX_FRAMES) {
    errors.push(`Requested ${nFrames} frames exceeds maximum of ${MAX_FRAMES}`);
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/// @brief Generate a single synthetic detection frame from aircraft data
/// @param aircraftDict Per-aircraft delay-Doppler data from adsb2dd
/// @param timestamp Frame timestamp (ms)
/// @param config Synthetic configuration
/// @param rng Random number generator
/// @return Frame object with {timestamp, delay, doppler, snr, adsb}
export function generateSyntheticFrame(aircraftDict, timestamp, config, rng) {
  const delays = [];
  const dopplers = [];
  const snrs = [];
  const adsb = [];

  // Process each aircraft
  for (const [hex, data] of Object.entries(aircraftDict)) {
    // Skip if no delay/Doppler data yet
    if (data.delay === undefined || data.doppler === undefined) {
      continue;
    }

    // Simulate missed detection
    if (!rng.bernoulli(config.detection_prob)) {
      continue;
    }

    // True delay and Doppler
    const trueDelay = data.delay;
    const trueDoppler = data.doppler;

    // Add Gaussian noise
    const noisyDelay = trueDelay + rng.gaussian(0, config.noise_delay);
    const noisyDoppler = trueDoppler + rng.gaussian(0, config.noise_doppler);

    // Generate realistic SNR
    const snr = rng.uniform(config.snr_min, config.snr_max);

    delays.push(noisyDelay);
    dopplers.push(noisyDoppler);
    snrs.push(snr);

    // Include ADS-B data for validation
    // Note: Need to get original aircraft data (lat/lon/alt/gs/track)
    // This will be populated by the endpoint logic
    adsb.push({
      hex: hex,
      flight: data.flight
      // lat, lon, alt_baro, gs, track will be added by endpoint
    });
  }

  // Add false alarms (clutter)
  const nFalseAlarms = rng.poisson(config.false_alarm_rate);
  for (let i = 0; i < nFalseAlarms; i++) {
    delays.push(rng.uniform(config.delay_min, config.delay_max));
    dopplers.push(rng.uniform(config.doppler_min, config.doppler_max));
    // Lower SNR for clutter (typically weaker)
    snrs.push(rng.uniform(config.snr_min, config.snr_max * 0.7));
    adsb.push(null);  // No ADS-B match for clutter
  }

  return {
    timestamp: timestamp,
    delay: delays,
    doppler: dopplers,
    snr: snrs,
    adsb: adsb
  };
}

/// @brief Generate complete synthetic detection dataset
/// @param getAircraftData Async function to fetch aircraft data
/// @param config Synthetic configuration
/// @return Array of detection frames
export async function generateSyntheticDataset(getAircraftData, config) {
  const rng = new SyntheticRNG(config.seed);
  const frames = [];

  const nFrames = Math.ceil((config.duration * 1000) / config.frame_interval);

  for (let i = 0; i < nFrames; i++) {
    const timestamp = Date.now() + i * config.frame_interval;

    // Fetch current aircraft data
    const aircraftDict = await getAircraftData();

    // Generate synthetic frame
    const frame = generateSyntheticFrame(aircraftDict, timestamp, config, rng);
    frames.push(frame);

    // Wait for frame interval (if generating in real-time)
    // For batch generation, skip this
  }

  return frames;
}

/// @brief Convert per-aircraft dict to frame-based arrays
/// @param aircraftDict Per-aircraft data from adsb2dd
/// @param aircraftRawData Raw aircraft data from tar1090/adsblol
/// @param timestamp Frame timestamp
/// @return Frame object with arrays
export function convertToFrameFormat(aircraftDict, aircraftRawData, timestamp) {
  const delays = [];
  const dopplers = [];
  const snrs = [];
  const adsb = [];

  // Create a map of hex codes to raw data for easy lookup
  const rawDataMap = {};
  if (aircraftRawData && aircraftRawData.aircraft) {
    for (const aircraft of aircraftRawData.aircraft) {
      rawDataMap[aircraft.hex] = aircraft;
    }
  }

  for (const [hex, data] of Object.entries(aircraftDict)) {
    if (data.delay === undefined || data.doppler === undefined) {
      continue;
    }

    delays.push(data.delay);
    dopplers.push(data.doppler);

    // Use a reasonable default SNR since we don't have real SNR data
    // In reality, SNR would come from the radar receiver
    snrs.push(15.0);

    // Get raw aircraft data for ADS-B fields
    const rawAircraft = rawDataMap[hex];
    if (rawAircraft) {
      adsb.push({
        hex: hex,
        lat: rawAircraft.lat,
        lon: rawAircraft.lon,
        alt_baro: rawAircraft.alt_baro || rawAircraft.alt_geom,
        gs: rawAircraft.gs,
        track: rawAircraft.track,
        flight: data.flight
      });
    } else {
      // Fallback if raw data not available
      adsb.push({
        hex: hex,
        flight: data.flight
      });
    }
  }

  return {
    timestamp: timestamp,
    delay: delays,
    doppler: dopplers,
    snr: snrs,
    adsb: adsb
  };
}

/// @brief Generate synthetic Mach 5 target trajectory
/// @param startLat Starting latitude (degrees)
/// @param startLon Starting longitude (degrees)
/// @param startAlt Starting altitude (meters)
/// @param heading Direction of travel (degrees, 0=North, 90=East)
/// @param duration Duration of trajectory (seconds)
/// @param timestep Time between positions (seconds)
/// @return Array of positions with {lat, lon, alt, timestamp, speed, heading}
export function generateMach5Trajectory(startLat, startLon, startAlt, heading, duration, timestep = 1.0) {
  const MACH_5_SPEED = 1715;
  const EARTH_RADIUS = 6371000;

  const positions = [];
  const numSteps = Math.ceil(duration / timestep);
  const startTime = Date.now();

  for (let i = 0; i < numSteps; i++) {
    const elapsedTime = i * timestep;
    const distanceTraveled = MACH_5_SPEED * elapsedTime;

    const headingRad = (heading * Math.PI) / 180;
    const angularDistance = distanceTraveled / EARTH_RADIUS;

    const lat1 = (startLat * Math.PI) / 180;
    const lon1 = (startLon * Math.PI) / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(headingRad)
    );

    const lon2 = lon1 + Math.atan2(
      Math.sin(headingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

    positions.push({
      lat: (lat2 * 180) / Math.PI,
      lon: (lon2 * 180) / Math.PI,
      alt: startAlt,
      timestamp: startTime + elapsedTime * 1000,
      speed: MACH_5_SPEED,
      heading: heading,
      hex: 'MACH5X',
      flight: 'MACH5',
      alt_baro: startAlt / 0.3048,
      gs: MACH_5_SPEED * 1.94384,
      track: heading
    });
  }

  return positions;
}

/// @brief Generate delay-Doppler data for Mach 5 trajectory
/// @param trajectory Array of positions from generateMach5Trajectory
/// @param rxLat Receiver latitude (degrees)
/// @param rxLon Receiver longitude (degrees)
/// @param rxAlt Receiver altitude (meters)
/// @param txLat Transmitter latitude (degrees)
/// @param txLon Transmitter longitude (degrees)
/// @param txAlt Transmitter altitude (meters)
/// @param fc Carrier frequency (MHz)
/// @return Array of {timestamp, delay, doppler, adsb}
export function trajectoryToDelayDoppler(trajectory, rxLat, rxLon, rxAlt, txLat, txLon, txAlt, fc) {
  const lla2ecef = (lat, lon, alt) => {
    const radian = Math.PI / 180.0;
    const a = 6378137.0;
    const f = 1.0 / 298.257223563;
    const esq = 2.0 * f - f * f;
    const latRad = lat * radian;
    const lonRad = lon * radian;
    const N = a / Math.sqrt(1.0 - esq * Math.sin(latRad) * Math.sin(latRad));
    return {
      x: (N + alt) * Math.cos(latRad) * Math.cos(lonRad),
      y: (N + alt) * Math.cos(latRad) * Math.sin(lonRad),
      z: (N * (1.0 - esq) + alt) * Math.sin(latRad)
    };
  };

  const norm = (vec) => Math.sqrt(vec.x ** 2 + vec.y ** 2 + vec.z ** 2);

  const ecefRx = lla2ecef(rxLat, rxLon, rxAlt);
  const ecefTx = lla2ecef(txLat, txLon, txAlt);
  const dRxTx = norm({
    x: ecefRx.x - ecefTx.x,
    y: ecefRx.y - ecefTx.y,
    z: ecefRx.z - ecefTx.z
  });

  const detections = [];

  for (let i = 0; i < trajectory.length; i++) {
    const pos = trajectory[i];
    const tar = lla2ecef(pos.lat, pos.lon, pos.alt);

    const dRxTar = norm({
      x: ecefRx.x - tar.x,
      y: ecefRx.y - tar.y,
      z: ecefRx.z - tar.z
    });

    const dTxTar = norm({
      x: ecefTx.x - tar.x,
      y: ecefTx.y - tar.y,
      z: ecefTx.z - tar.z
    });

    const delay = (dRxTar + dTxTar - dRxTx) / 1000;

    let doppler = 0;
    if (i > 0) {
      const prevPos = trajectory[i - 1];
      const dt = (pos.timestamp - prevPos.timestamp) / 1000;
      const prevTar = lla2ecef(prevPos.lat, prevPos.lon, prevPos.alt);
      const prevDRxTar = norm({
        x: ecefRx.x - prevTar.x,
        y: ecefRx.y - prevTar.y,
        z: ecefRx.z - prevTar.z
      });
      const prevDTxTar = norm({
        x: ecefTx.x - prevTar.x,
        y: ecefTx.y - prevTar.y,
        z: ecefTx.z - prevTar.z
      });
      const prevBistatic = prevDRxTar + prevDTxTar;
      const currBistatic = dRxTar + dTxTar;
      const rangeRate = (currBistatic - prevBistatic) / dt;
      const wavelength = 299792458 / (fc * 1e6);
      doppler = -rangeRate / wavelength;
    }

    detections.push({
      timestamp: pos.timestamp,
      delay: delay,
      doppler: doppler,
      adsb: {
        hex: pos.hex,
        lat: pos.lat,
        lon: pos.lon,
        alt_baro: pos.alt_baro,
        gs: pos.gs,
        track: pos.track,
        flight: pos.flight
      }
    });
  }

  return detections;
}
