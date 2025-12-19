#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { generateMach5Trajectory, trajectoryToDelayDoppler, SyntheticRNG } from './src/node/synthetic.js';

const DEFAULT_CONFIG = {
  rx: {
    lat: 37.7644,
    lon: -122.3954,
    alt: 23
  },
  tx: {
    lat: 37.49917,
    lon: -121.87222,
    alt: 783
  },
  fc: 503,
  targets: [
    {
      startLat: 37.5,
      startLon: -123.0,
      startAlt: 15000,
      heading: 90,
      duration: 60,
      timestep: 0.5
    }
  ],
  output: './data/mach5_targets.detection',
  addNoise: true,
  noiseConfig: {
    delay: 0.5,
    doppler: 2.0,
    snr_min: 8,
    snr_max: 20,
    seed: 'mach5-test'
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--rx':
        const rx = args[++i].split(',').map(parseFloat);
        config.rx = { lat: rx[0], lon: rx[1], alt: rx[2] };
        break;
      case '--tx':
        const tx = args[++i].split(',').map(parseFloat);
        config.tx = { lat: tx[0], lon: tx[1], alt: tx[2] };
        break;
      case '--fc':
        config.fc = parseFloat(args[++i]);
        break;
      case '--start':
        const start = args[++i].split(',').map(parseFloat);
        config.targets[0].startLat = start[0];
        config.targets[0].startLon = start[1];
        config.targets[0].startAlt = start[2];
        break;
      case '--heading':
        config.targets[0].heading = parseFloat(args[++i]);
        break;
      case '--duration':
        config.targets[0].duration = parseFloat(args[++i]);
        break;
      case '--timestep':
        config.targets[0].timestep = parseFloat(args[++i]);
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--no-noise':
        config.addNoise = false;
        break;
      case '--help':
        printUsage();
        process.exit(0);
    }
  }

  return config;
}

function printUsage() {
  console.log(`
Usage: node generate_mach5_targets.js [options]

Generate synthetic Mach 5 target data for testing anomaly detection systems.

Options:
  --rx LAT,LON,ALT       Receiver position (default: 37.7644,-122.3954,23)
  --tx LAT,LON,ALT       Transmitter position (default: 37.49917,-121.87222,783)
  --fc FREQUENCY         Carrier frequency in MHz (default: 503)
  --start LAT,LON,ALT    Starting position for Mach 5 target (default: 37.5,-123.0,15000)
  --heading DEGREES      Direction of travel (default: 90, eastward)
  --duration SECONDS     Duration of trajectory (default: 60)
  --timestep SECONDS     Time between position samples (default: 0.5)
  --output FILE          Output .detection file (default: ./data/mach5_targets.detection)
  --no-noise             Disable synthetic noise (perfect measurements)
  --help                 Show this help message

Examples:
  # Generate default Mach 5 target
  node generate_mach5_targets.js

  # Custom trajectory heading north from SF
  node generate_mach5_targets.js --start 37.7,-122.4,15000 --heading 0 --duration 120

  # Perfect measurements (no noise)
  node generate_mach5_targets.js --no-noise --output data/mach5_perfect.detection
`);
}

function main() {
  const config = parseArgs();

  console.log('Generating Mach 5 anomalous targets...\n');
  console.log('Configuration:');
  console.log(`  RX: ${config.rx.lat}, ${config.rx.lon}, ${config.rx.alt}m`);
  console.log(`  TX: ${config.tx.lat}, ${config.tx.lon}, ${config.tx.alt}m`);
  console.log(`  Frequency: ${config.fc} MHz`);
  console.log(`  Output: ${config.output}`);
  console.log(`  Noise: ${config.addNoise ? 'enabled' : 'disabled'}\n`);

  const outputDir = path.dirname(config.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const allFrames = [];

  for (const targetConfig of config.targets) {
    console.log(`Generating trajectory:`);
    console.log(`  Start: ${targetConfig.startLat}, ${targetConfig.startLon}, ${targetConfig.startAlt}m`);
    console.log(`  Heading: ${targetConfig.heading}°`);
    console.log(`  Duration: ${targetConfig.duration}s`);
    console.log(`  Timestep: ${targetConfig.timestep}s`);

    const trajectory = generateMach5Trajectory(
      targetConfig.startLat,
      targetConfig.startLon,
      targetConfig.startAlt,
      targetConfig.heading,
      targetConfig.duration,
      targetConfig.timestep
    );

    console.log(`  Generated ${trajectory.length} positions`);

    const detections = trajectoryToDelayDoppler(
      trajectory,
      config.rx.lat,
      config.rx.lon,
      config.rx.alt,
      config.tx.lat,
      config.tx.lon,
      config.tx.alt,
      config.fc
    );

    if (config.addNoise) {
      const rng = new SyntheticRNG(config.noiseConfig.seed);
      for (const detection of detections) {
        detection.delay += rng.gaussian(0, config.noiseConfig.delay);
        detection.doppler += rng.gaussian(0, config.noiseConfig.doppler);
        detection.snr = rng.uniform(config.noiseConfig.snr_min, config.noiseConfig.snr_max);
      }
    }

    for (const detection of detections) {
      allFrames.push({
        timestamp: detection.timestamp,
        delay: [detection.delay],
        doppler: [detection.doppler],
        snr: [detection.snr || 15.0],
        adsb: [detection.adsb]
      });
    }
  }

  fs.writeFileSync(config.output, JSON.stringify(allFrames, null, 2));
  console.log(`\nWrote ${allFrames.length} frames to ${config.output}`);

  const firstFrame = allFrames[0];
  const lastFrame = allFrames[allFrames.length - 1];
  console.log(`\nSummary:`);
  console.log(`  First detection:`);
  console.log(`    Delay: ${firstFrame.delay[0].toFixed(2)} km`);
  console.log(`    Doppler: ${firstFrame.doppler[0].toFixed(2)} Hz`);
  console.log(`  Last detection:`);
  console.log(`    Delay: ${lastFrame.delay[0].toFixed(2)} km`);
  console.log(`    Doppler: ${lastFrame.doppler[0].toFixed(2)} Hz`);

  const delayRange = Math.max(...allFrames.map(f => f.delay[0])) - Math.min(...allFrames.map(f => f.delay[0]));
  const dopplerRange = Math.max(...allFrames.map(f => f.doppler[0])) - Math.min(...allFrames.map(f => f.doppler[0]));
  console.log(`\nRange covered:`);
  console.log(`  Delay: ${delayRange.toFixed(2)} km`);
  console.log(`  Doppler: ${dopplerRange.toFixed(2)} Hz`);

  console.log(`\nMach 5 speed: ~1715 m/s`);
  console.log(`Ground speed: ~${(1715 * 1.94384).toFixed(0)} knots`);
}

main();
