#!/usr/bin/env node
// Convert captured tar1090 snapshots to synthetic detection data

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import from src/node
import { lla2ecef, norm } from './src/node/geometry.js';
import { calculateDopplerFromVelocity } from './src/node/doppler.js';
import {
  SyntheticRNG,
  parseSyntheticConfig,
  validateSyntheticConfig,
  generateSyntheticFrame
} from './src/node/synthetic.js';

// Configuration
const SNAPSHOTS_DIR = './data/adsb_snapshots';
const OUTPUT_FILE = './data/synthetic_historical.detection';

// Radar parameters from blah2 config
const RX_LAT = 37.7644;    // 150 Mississippi
const RX_LON = -122.3954;
const RX_ALT = 23;         // meters

const TX_LAT = 37.49917;   // KSCZ-LD
const TX_LON = -121.87222;
const TX_ALT = 783;        // meters

const FC = 503;            // MHz

// Synthetic noise configuration
const SYNTHETIC_CONFIG = {
  noise_delay: 0.5,
  noise_doppler: 2.0,
  snr_min: 8,
  snr_max: 20,
  detection_prob: 0.95,
  false_alarm_rate: 0.5,
  delay_min: 0,
  delay_max: 400,
  doppler_min: -200,
  doppler_max: 200,
  seed: 'historical-test-123'
};

function ft2m(ft) {
  return ft * 0.3048;
}

function processSnapshots() {
  console.log('Processing ADS-B snapshots to synthetic detections...\n');

  // Pre-compute ECEF coordinates and baseline
  const ecefRx = lla2ecef(RX_LAT, RX_LON, RX_ALT);
  const ecefTx = lla2ecef(TX_LAT, TX_LON, TX_ALT);
  const dRxTx = norm({
    x: ecefRx.x - ecefTx.x,
    y: ecefRx.y - ecefTx.y,
    z: ecefRx.z - ecefTx.z
  });

  console.log('Radar Configuration:');
  console.log(`  RX: ${RX_LAT}, ${RX_LON}, ${RX_ALT}m`);
  console.log(`  TX: ${TX_LAT}, ${TX_LON}, ${TX_ALT}m`);
  console.log(`  Baseline: ${dRxTx.toFixed(2)} m`);
  console.log(`  Frequency: ${FC} MHz\n`);

  // Initialize RNG
  const rng = new SyntheticRNG(SYNTHETIC_CONFIG.seed);

  // Read all snapshot files
  const files = fs.readdirSync(SNAPSHOTS_DIR)
    .filter(f => f.startsWith('aircraft_') && f.endsWith('.json'))
    .sort();

  console.log(`Found ${files.length} snapshot files\n`);

  if (files.length === 0) {
    console.error('No snapshot files found!');
    process.exit(1);
  }

  // Process each snapshot
  const detectionFrames = [];
  let processedCount = 0;

  for (const file of files) {
    const filePath = path.join(SNAPSHOTS_DIR, file);
    const timestamp = parseInt(file.match(/aircraft_(\d+)\.json/)[1]);

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (!data.aircraft) {
        console.warn(`Skipping ${file}: no aircraft array`);
        continue;
      }

      // Compute delay-Doppler for each aircraft
      const aircraftDict = {};

      for (const aircraft of data.aircraft) {
        // Skip if missing required fields
        if (!aircraft.hex || !aircraft.lat || !aircraft.lon || !aircraft.alt_geom) {
          continue;
        }

        // Compute ECEF position
        const tar = lla2ecef(aircraft.lat, aircraft.lon, ft2m(aircraft.alt_geom));

        // Compute distances
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

        // Compute delay
        const delay = (dRxTar + dTxTar - dRxTx) / 1000;

        // Compute Doppler (if velocity available)
        let doppler = null;
        if (aircraft.gs !== undefined && aircraft.track !== undefined) {
          doppler = calculateDopplerFromVelocity(
            aircraft, tar, ecefRx, ecefTx, dRxTar, dTxTar, FC
          );
        }

        // Skip if invalid
        if (!delay || !doppler || delay < 0) {
          continue;
        }

        aircraftDict[aircraft.hex] = {
          delay: delay,
          doppler: doppler,
          flight: aircraft.flight || aircraft.hex,
          lat: aircraft.lat,
          lon: aircraft.lon,
          alt_baro: aircraft.alt_baro || aircraft.alt_geom,
          gs: aircraft.gs,
          track: aircraft.track
        };
      }

      // Generate synthetic frame with noise
      const frame = generateSyntheticFrame(aircraftDict, timestamp, SYNTHETIC_CONFIG, rng);

      // Add full ADS-B metadata
      for (let i = 0; i < frame.adsb.length; i++) {
        if (frame.adsb[i] !== null) {
          const hex = frame.adsb[i].hex;
          const aircraft = aircraftDict[hex];
          if (aircraft) {
            frame.adsb[i] = {
              hex: hex,
              lat: aircraft.lat,
              lon: aircraft.lon,
              alt_baro: aircraft.alt_baro,
              gs: aircraft.gs,
              track: aircraft.track,
              flight: aircraft.flight
            };
          }
        }
      }

      detectionFrames.push(frame);
      processedCount++;

      if (processedCount % 10 === 0) {
        process.stdout.write(`\rProcessed: ${processedCount}/${files.length} frames`);
      }

    } catch (err) {
      console.warn(`\nError processing ${file}: ${err.message}`);
    }
  }

  console.log(`\rProcessed: ${processedCount}/${files.length} frames\n`);

  // Write output file (one frame per line)
  const outputLines = detectionFrames.map(frame => JSON.stringify(frame));
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n') + '\n');

  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Total frames: ${detectionFrames.length}`);
  console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB\n`);

  // Show statistics
  const totalDetections = detectionFrames.reduce((sum, f) => sum + f.delay.length, 0);
  const totalAircraft = detectionFrames.reduce((sum, f) =>
    sum + f.adsb.filter(a => a !== null).length, 0
  );
  const totalFalseAlarms = detectionFrames.reduce((sum, f) =>
    sum + f.adsb.filter(a => a === null).length, 0
  );

  console.log('Statistics:');
  console.log(`  Total detections: ${totalDetections}`);
  console.log(`  Aircraft detections: ${totalAircraft}`);
  console.log(`  False alarms: ${totalFalseAlarms}`);
  console.log(`  Avg detections/frame: ${(totalDetections / detectionFrames.length).toFixed(1)}`);
  console.log('');
  console.log('Ready to test with retina-tracker!');
  console.log(`  cd ../retina-tracker`);
  console.log(`  python -m tracker.track_detections ../adsb2dd/${OUTPUT_FILE} -o output/tracks.json -v output/tracks.png`);
}

// Run
processSnapshots();
