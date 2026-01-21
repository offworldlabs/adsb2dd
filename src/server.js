import express from 'express';
import cors from 'cors';

import {checkTar1090, getTar1090} from './node/tar1090.js';
import {checkAdsbLol, getAdsbLol} from './node/adsblol.js';
import {lla2ecef, norm, ft2m} from './node/geometry.js';
import {isValidNumber} from './node/validate.js';
import {calculateDopplerFromVelocity, calculateWavelength} from './node/doppler.js';
import {SyntheticRNG, parseSyntheticConfig, validateSyntheticConfig,
        generateSyntheticFrame, convertToFrameFormat} from './node/synthetic.js';

const app = express();
app.use(cors());
const port = process.env.PORT || 49155;

var dict = {};
const tUpdate = 1000;
const nApiMax = 10;
const tDelete = 30;
const tDeletePlane = 5;
const tMaxStaleness = 10;
const nMaxDelayArray = 10;
const nDopplerSmooth = 10;
const adsbLolRadius = 40;

app.use(express.static('public'));

app.get('/api/dd', async (req, res) => {

  if (req.originalUrl in dict) {
    dict[req.originalUrl]['timestamp'] = Date.now()/1000;
    return res.json(dict[req.originalUrl]['out']);
  }

  if (Object.keys(dict).length > nApiMax) {
    return res.status(400).json({ error: 'Exceeded max API requests.' });
  }

  const server = req.query.server;
  const rxParams = req.query.rx?.split(',').map(parseFloat);
  const txParams = req.query.tx?.split(',').map(parseFloat);
  const fc = parseFloat(req.query.fc);
  if (!server || !rxParams || !txParams || !rxParams.every(isValidNumber) || !txParams.every(isValidNumber) || isNaN(fc) || fc <= 0) {
    return res.status(400).json({ error: 'Invalid parameters. Required: server, rx, tx, fc' });
  }
  const [rxLat, rxLon, rxAlt] = rxParams;
  const [txLat, txLon, txAlt] = txParams;

  let serverUrl;
  try {
    serverUrl = new URL(server);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid server URL format' });
  }

  if (!['http:', 'https:'].includes(serverUrl.protocol)) {
    return res.status(400).json({ error: 'Server URL must use http or https protocol' });
  }

  const isAdsbLol = serverUrl.hostname === 'api.adsb.lol';

  if (isAdsbLol) {
    if (server !== 'https://api.adsb.lol' || serverUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Invalid adsb.lol URL' });
    }
  }

  let isServerValid;
  let midLat, midLon;

  if (isAdsbLol) {
    midLat = (rxLat + txLat) / 2;
    midLon = (rxLon + txLon) / 2;
    if (isNaN(midLat) || isNaN(midLon)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    isServerValid = await checkAdsbLol(midLat, midLon, adsbLolRadius);
  } else {
    const apiUrl = new URL('/data/aircraft.json', server).href;
    isServerValid = await checkTar1090(apiUrl);
  }

  if (isServerValid) {
    dict[req.originalUrl] = {};
    dict[req.originalUrl]['rxLat'] = rxLat;
    dict[req.originalUrl]['rxLon'] = rxLon;
    dict[req.originalUrl]['rxAlt'] = rxAlt;
    dict[req.originalUrl]['txLat'] = txLat;
    dict[req.originalUrl]['txLon'] = txLon;
    dict[req.originalUrl]['txAlt'] = txAlt;
    dict[req.originalUrl]['fc'] = fc;
    dict[req.originalUrl]['server'] = server;
    dict[req.originalUrl]['isAdsbLol'] = isAdsbLol;
    if (isAdsbLol) {
      dict[req.originalUrl]['midLat'] = midLat;
      dict[req.originalUrl]['midLon'] = midLon;
    } else {
      dict[req.originalUrl]['apiUrl'] = new URL('/data/aircraft.json', server).href;
    }
    dict[req.originalUrl]['out'] = {};
    dict[req.originalUrl]['timestamp'] = Date.now()/1000;
    dict[req.originalUrl]['lastProcessed'] = 0;
    dict[req.originalUrl]['lastProcessedTime'] = 0;
    dict[req.originalUrl]['proc'] = {};
    const ecefRx = lla2ecef(rxLat, rxLon, rxAlt);
    const ecefTx = lla2ecef(txLat, txLon, txAlt);
    dict[req.originalUrl]['ecefRx'] = ecefRx;
    dict[req.originalUrl]['ecefTx'] = ecefTx;
    dict[req.originalUrl]['dRxTx'] = norm([ecefRx.x - ecefTx.x,
      ecefRx.y - ecefTx.y, ecefRx.z - ecefTx.z]);
    return res.json(dict[req.originalUrl]['out']);
  } else {
    return res.status(500).json({ error: 'Error checking data source validity.' });
  }

});

app.get('/api/synthetic-detections', async (req, res) => {
  // Parse synthetic configuration
  const syntheticConfig = parseSyntheticConfig(req.query);

  // Validate configuration
  const validation = validateSyntheticConfig(syntheticConfig);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Invalid synthetic configuration',
      details: validation.errors
    });
  }

  // Validate regular parameters (same as /api/dd)
  const server = req.query.server;
  const rxParams = req.query.rx?.split(',').map(parseFloat);
  const txParams = req.query.tx?.split(',').map(parseFloat);
  const fc = parseFloat(req.query.fc);

  if (!server || !rxParams || !txParams || !rxParams.every(isValidNumber) ||
      !txParams.every(isValidNumber) || isNaN(fc) || fc <= 0) {
    return res.status(400).json({
      error: 'Invalid parameters. Required: server, rx, tx, fc'
    });
  }

  const [rxLat, rxLon, rxAlt] = rxParams;
  const [txLat, txLon, txAlt] = txParams;

  // Validate server URL (same as /api/dd)
  let serverUrl;
  try {
    serverUrl = new URL(server);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid server URL format' });
  }

  if (!['http:', 'https:'].includes(serverUrl.protocol)) {
    return res.status(400).json({
      error: 'Server URL must use http or https protocol'
    });
  }

  const isAdsbLol = serverUrl.hostname === 'api.adsb.lol';

  if (isAdsbLol) {
    if (server !== 'https://api.adsb.lol' || serverUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Invalid adsb.lol URL' });
    }
  }

  // Initialize RNG
  const rng = new SyntheticRNG(syntheticConfig.seed);

  // Pre-compute ECEF coordinates
  const ecefRx = lla2ecef(rxLat, rxLon, rxAlt);
  const ecefTx = lla2ecef(txLat, txLon, txAlt);
  const dRxTx = norm([ecefRx.x - ecefTx.x, ecefRx.y - ecefTx.y,
                      ecefRx.z - ecefTx.z]);

  // Generate frames
  const frames = [];
  const nFrames = Math.ceil((syntheticConfig.duration * 1000) /
                             syntheticConfig.frame_interval);

  for (let i = 0; i < nFrames; i++) {
    const timestamp = Date.now() + i * syntheticConfig.frame_interval;

    // Fetch aircraft data
    let json;
    if (isAdsbLol) {
      const midLat = (rxLat + txLat) / 2;
      const midLon = (rxLon + txLon) / 2;
      json = await getAdsbLol(midLat, midLon, adsbLolRadius);
    } else {
      const apiUrl = new URL('/data/aircraft.json', server).href;
      json = await getTar1090(apiUrl);
    }

    if (!json || !json.aircraft || !Array.isArray(json.aircraft)) {
      // No aircraft data - generate empty frame or skip
      frames.push({
        timestamp: timestamp,
        delay: [],
        doppler: [],
        snr: [],
        adsb: []
      });
      continue;
    }

    // Compute delay-Doppler for all aircraft
    const aircraftDict = {};
    for (const aircraft of json.aircraft) {
      const isValidAircraft = isValidNumber(aircraft['lat']) &&
                             isValidNumber(aircraft['lon']) &&
                             isValidNumber(aircraft['alt_geom']) &&
                             (aircraft['flight'] != undefined);

      if (!isValidAircraft) {
        continue;
      }

      try {
        const hexCode = aircraft.hex;
        const tar = lla2ecef(aircraft['lat'], aircraft['lon'],
                            ft2m(aircraft['alt_geom']));

        const dRxTar = norm([ecefRx.x - tar.x, ecefRx.y - tar.y,
                            ecefRx.z - tar.z]);
        const dTxTar = norm([ecefTx.x - tar.x, ecefTx.y - tar.y,
                            ecefTx.z - tar.z]);
        const delay = (dRxTar + dTxTar - dRxTx) / 1000;

        const doppler = calculateDopplerFromVelocity(
          aircraft, tar, ecefRx, ecefTx, dRxTar, dTxTar, fc
        );

        if (doppler !== null) {
          aircraftDict[hexCode] = {
            delay: delay,
            doppler: doppler,
            flight: aircraft.flight,
            lat: aircraft.lat,
            lon: aircraft.lon,
            alt_baro: aircraft.alt_baro || aircraft.alt_geom,
            gs: aircraft.gs,
            track: aircraft.track
          };
        }
      } catch (err) {
        console.error(`Error computing delay-Doppler for aircraft ${aircraft.hex}:`, err.message);
        continue;
      }
    }

    // Generate synthetic frame with noise
    const delays = [];
    const dopplers = [];
    const snrs = [];
    const adsb = [];

    // Add detections for each aircraft
    for (const [hex, data] of Object.entries(aircraftDict)) {
      // Simulate missed detection
      if (!rng.bernoulli(syntheticConfig.detection_prob)) {
        continue;
      }

      // Add Gaussian noise
      const noisyDelay = data.delay + rng.gaussian(0, syntheticConfig.noise_delay);
      const noisyDoppler = data.doppler + rng.gaussian(0, syntheticConfig.noise_doppler);
      const snr = rng.uniform(syntheticConfig.snr_min, syntheticConfig.snr_max);

      delays.push(noisyDelay);
      dopplers.push(noisyDoppler);
      snrs.push(snr);
      adsb.push({
        hex: hex,
        lat: data.lat,
        lon: data.lon,
        alt_baro: data.alt_baro,
        gs: data.gs,
        track: data.track,
        flight: data.flight
      });
    }

    // Add false alarms (clutter)
    const nFalseAlarms = rng.poisson(syntheticConfig.false_alarm_rate);
    for (let j = 0; j < nFalseAlarms; j++) {
      delays.push(rng.uniform(syntheticConfig.delay_min, syntheticConfig.delay_max));
      dopplers.push(rng.uniform(syntheticConfig.doppler_min, syntheticConfig.doppler_max));
      snrs.push(rng.uniform(syntheticConfig.snr_min, syntheticConfig.snr_max * 0.7));
      adsb.push(null);
    }

    frames.push({
      timestamp: timestamp,
      delay: delays,
      doppler: dopplers,
      snr: snrs,
      adsb: adsb
    });
  }

  return res.json(frames);
});

// Use '::' for IPv6 dual-stack to support mDNS .local access from IPv6 clients
const host = process.env.HOST || '::';
app.listen(port, host, () => {
  console.log(`Server is running at http://${host}:${port}`);
});

/// @brief Main event loop to update dict data.
/// @details Loops over each request URL and updates dict data.
/// This means multiple geometries/frequencies/servers can be used simultaneously.
/// Removes dict entry if API not called for some time.
/// Recursive setTimeout call ensures no function overlapping.
/// @return Void.
const process_adsb2dd = async () => {

  for (const [key, value] of Object.entries(dict)) {

    let json;
    if (dict[key]['isAdsbLol']) {
      json = await getAdsbLol(dict[key]['midLat'], dict[key]['midLon'], adsbLolRadius);
    } else {
      json = await getTar1090(dict[key]['apiUrl']);
    }

    if (!json || !json.aircraft || !Array.isArray(json.aircraft)) {
      continue;
    }

    const currentTime = Date.now() / 1000;
    const timeSinceProcessed = currentTime - dict[key]['lastProcessedTime'];
    if (json.now === dict[key]['lastProcessed'] && timeSinceProcessed < tMaxStaleness) {
      continue;
    }

    adsb2dd(key, json);

    dict[key]['lastProcessed'] = json.now;
    dict[key]['lastProcessedTime'] = currentTime;

    if (Date.now()/1000 - dict[key]['timestamp'] > tDelete) {
      delete(dict[key]);
    }

  }

  setTimeout(process_adsb2dd, tUpdate);
};
setTimeout(process_adsb2dd, tUpdate);


/// @brief Convert ADS-B coordinates to delay-Doppler coordinates.
/// @details Implements core functionality of this program.
/// Compute bistatic delay and Doppler using rx/tx locations.
/// Apply coefficient to convert m/s to Hz.
/// @param key Current key in dict (API endpoint).
/// @param json Current JSON from tar1090 server.
function adsb2dd(key, json) {

  for (const aircraft in dict[key]['out']) {
    if (Date.now()/1000 - dict[key]['out'][aircraft]['timestamp'] > tDeletePlane) {
      delete(dict[key]['out'][aircraft]);
      delete(dict[key]['proc'][aircraft]);
    }
  }

  for (const aircraft of json.aircraft) {
    const isValidAircraft = isValidNumber(aircraft['lat']) &&
                           isValidNumber(aircraft['lon']) &&
                           isValidNumber(aircraft['alt_geom']) &&
                           (aircraft['flight'] != undefined);

    if (!isValidAircraft) {
      continue;
    }

    const hexCode = aircraft.hex;
    if (!(hexCode in dict[key]['out'])) {
      dict[key]['out'][hexCode] = {};
      dict[key]['proc'][hexCode] = {};
      dict[key]['proc'][hexCode]['delays'] = [];
      dict[key]['proc'][hexCode]['timestamps'] = [];
    }

    if (dict[key]['out'][hexCode]['lat'] === aircraft['lat'] &&
      dict[key]['out'][hexCode]['lon'] === aircraft['lon'] &&
      dict[key]['out'][hexCode]['alt'] === aircraft['alt_geom']) {
      continue;
    }

    dict[key]['out'][hexCode]['timestamp'] = json.now - aircraft.seen_pos;
    dict[key]['out'][hexCode]['flight'] = (aircraft.flight);
    dict[key]['proc'][hexCode]['lat'] = aircraft['lat'];
    dict[key]['proc'][hexCode]['lon'] = aircraft['lon'];
    dict[key]['proc'][hexCode]['alt'] = aircraft['alt_geom'];

    const tar = lla2ecef(aircraft['lat'], aircraft['lon'], ft2m(aircraft['alt_geom']));

    const dRxTar = norm([dict[key]['ecefRx'].x-tar.x,
      dict[key]['ecefRx'].y-tar.y,
      dict[key]['ecefRx'].z-tar.z]);
    const dTxTar = norm([dict[key]['ecefTx'].x-tar.x,
      dict[key]['ecefTx'].y-tar.y,
      dict[key]['ecefTx'].z-tar.z]);
    const delay = dRxTar + dTxTar - dict[key]['dRxTx'];

    dict[key]['proc'][hexCode]['delays'].push(delay);
    dict[key]['proc'][hexCode]['timestamps'].push(json.now - aircraft.seen_pos);

    const doppler_vel = calculateDopplerFromVelocity(
      aircraft,
      tar,
      dict[key]['ecefRx'],
      dict[key]['ecefTx'],
      dRxTar,
      dTxTar,
      dict[key]['fc']
    );

    let doppler_pos = null;
    if (dict[key]['proc'][hexCode]['delays'].length >= 2) {
      const doppler_ms_arr = smoothedDerivativeUsingMedian(
        dict[key]['proc'][hexCode]['delays'],
        dict[key]['proc'][hexCode]['timestamps'], nDopplerSmooth);
      const doppler_ms = doppler_ms_arr.at(-1);

      const wavelength = calculateWavelength(dict[key]['fc']);
      doppler_pos = -doppler_ms / wavelength;

      if (dict[key]['proc'][hexCode]['delays'].length >= nMaxDelayArray) {
        dict[key]['proc'][hexCode]['delays'].shift();
        dict[key]['proc'][hexCode]['timestamps'].shift();
      }
    }

    dict[key]['out'][hexCode]['delay'] = limit_digits(delay/1000, 5)

    if (doppler_vel !== null) {
      dict[key]['out'][hexCode]['doppler'] = limit_digits(doppler_vel, 5);
      dict[key]['out'][hexCode]['doppler_method'] = 'velocity';
    } else if (doppler_pos !== null) {
      dict[key]['out'][hexCode]['doppler'] = limit_digits(doppler_pos, 5);
      dict[key]['out'][hexCode]['doppler_method'] = 'position';
    }

    if (doppler_vel !== null) {
      dict[key]['out'][hexCode]['doppler_vel'] = limit_digits(doppler_vel, 5);
    }
    if (doppler_pos !== null) {
      dict[key]['out'][hexCode]['doppler_pos'] = limit_digits(doppler_pos, 5);
    }

  }

}


function limit_digits(number, digits) {
  if (Number.isInteger(number)) {
    return number;
  } else {
    return number.toFixed(digits);
  }
}

/// @brief Computes a smoothed derivative of delays with respect to timestamps.
/// @details Using a moving median method on the last k samples.
/// If fewer than k samples are given for delays and timestamps, it will use all available samples.
/// Just a hunch and probably not optimum.
/// @param delays Array to diff.
/// @param timestamps Array to diff with respect to.
/// @param k Maximum number of samples to compute median on.
/// @return Array containing a smoothed derivative.
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

    const movingMedianDerivative = calculateMovingMedian(deltaDelays);

    result.push(movingMedianDerivative);
  }

  return result;
}

/// @brief Helper function to calculate the moving median of an array
/// @param arr Array to calculate moving median on.
/// @return Array of moving median.
function calculateMovingMedian(arr) {
  const sortedArr = [...arr].sort((a, b) => a - b);
  const middle = Math.floor(sortedArr.length / 2);

  if (sortedArr.length % 2 === 0) {
    return (sortedArr[middle - 1] + sortedArr[middle]) / 2;
  } else {
    return sortedArr[middle];
  }
}

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received.');
  process.exit(0);
});