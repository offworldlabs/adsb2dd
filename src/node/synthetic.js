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
