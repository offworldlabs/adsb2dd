import {
  SyntheticRNG,
  DEFAULT_SYNTHETIC_CONFIG,
  parseSyntheticConfig,
  validateSyntheticConfig,
  generateSyntheticFrame,
  convertToFrameFormat,
  generateMach5Trajectory,
  trajectoryToDelayDoppler
} from '../src/node/synthetic.js';

describe('Synthetic Detection Generation', () => {
  describe('SyntheticRNG', () => {
    test('uniform distribution produces values in range', () => {
      const rng = new SyntheticRNG(42);
      const samples = Array.from({length: 1000}, () => rng.uniform(10, 20));

      expect(Math.min(...samples)).toBeGreaterThanOrEqual(10);
      expect(Math.max(...samples)).toBeLessThanOrEqual(20);

      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(mean).toBeCloseTo(15, 0);
    });

    test('gaussian distribution has correct statistics', () => {
      const rng = new SyntheticRNG(42);
      const mean = 5.0;
      const std = 2.0;
      const samples = Array.from({length: 10000}, () => rng.gaussian(mean, std));

      const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const sampleStd = Math.sqrt(
        samples.reduce((sum, x) => sum + (x - sampleMean) ** 2, 0) / samples.length
      );

      expect(sampleMean).toBeCloseTo(mean, 1);
      expect(sampleStd).toBeCloseTo(std, 1);
    });

    test('poisson distribution has correct mean', () => {
      const rng = new SyntheticRNG(42);
      const lambda = 5.0;
      const samples = Array.from({length: 10000}, () => rng.poisson(lambda));

      const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(sampleMean).toBeCloseTo(lambda, 0);
    });

    test('poisson with lambda=0 returns 0', () => {
      const rng = new SyntheticRNG(42);
      expect(rng.poisson(0)).toBe(0);
      expect(rng.poisson(-1)).toBe(0);
    });

    test('bernoulli produces correct probability', () => {
      const rng = new SyntheticRNG(42);
      const p = 0.7;
      const samples = Array.from({length: 10000}, () => rng.bernoulli(p));

      const successRate = samples.filter(x => x).length / samples.length;
      expect(successRate).toBeCloseTo(p, 1);
    });

    test('seeded RNG produces reproducible results', () => {
      const rng1 = new SyntheticRNG('test-seed');
      const rng2 = new SyntheticRNG('test-seed');

      const samples1 = Array.from({length: 100}, () => rng1.uniform(0, 1));
      const samples2 = Array.from({length: 100}, () => rng2.uniform(0, 1));

      for (let i = 0; i < samples1.length; i++) {
        expect(samples1[i]).toBe(samples2[i]);
      }
    });

    test('different seeds produce different sequences', () => {
      const rng1 = new SyntheticRNG('seed1');
      const rng2 = new SyntheticRNG('seed2');

      const samples1 = Array.from({length: 10}, () => rng1.uniform(0, 1));
      const samples2 = Array.from({length: 10}, () => rng2.uniform(0, 1));

      const allDifferent = samples1.some((val, idx) => val !== samples2[idx]);
      expect(allDifferent).toBe(true);
    });
  });

  describe('Configuration parsing', () => {
    test('uses defaults when no query parameters provided', () => {
      const config = parseSyntheticConfig({});
      expect(config).toEqual(DEFAULT_SYNTHETIC_CONFIG);
    });

    test('parses noise_delay parameter', () => {
      const config = parseSyntheticConfig({noise_delay: '1.5'});
      expect(config.noise_delay).toBe(1.5);
    });

    test('parses noise_doppler parameter', () => {
      const config = parseSyntheticConfig({noise_doppler: '3.0'});
      expect(config.noise_doppler).toBe(3.0);
    });

    test('parses SNR parameters', () => {
      const config = parseSyntheticConfig({snr_min: '10', snr_max: '25'});
      expect(config.snr_min).toBe(10);
      expect(config.snr_max).toBe(25);
    });

    test('parses detection probability', () => {
      const config = parseSyntheticConfig({detection_prob: '0.8'});
      expect(config.detection_prob).toBe(0.8);
    });

    test('parses false alarm rate', () => {
      const config = parseSyntheticConfig({false_alarm_rate: '2.0'});
      expect(config.false_alarm_rate).toBe(2.0);
    });

    test('parses frame interval and duration', () => {
      const config = parseSyntheticConfig({frame_interval: '1000', duration: '30'});
      expect(config.frame_interval).toBe(1000);
      expect(config.duration).toBe(30);
    });

    test('parses delay and doppler ranges', () => {
      const config = parseSyntheticConfig({
        delay_min: '50',
        delay_max: '500',
        doppler_min: '-300',
        doppler_max: '300'
      });
      expect(config.delay_min).toBe(50);
      expect(config.delay_max).toBe(500);
      expect(config.doppler_min).toBe(-300);
      expect(config.doppler_max).toBe(300);
    });

    test('parses seed parameter', () => {
      const config = parseSyntheticConfig({seed: 'test-seed-123'});
      expect(config.seed).toBe('test-seed-123');
    });
  });

  describe('Configuration validation', () => {
    test('validates default configuration', () => {
      const result = validateSyntheticConfig(DEFAULT_SYNTHETIC_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('rejects negative noise_delay', () => {
      const config = {...DEFAULT_SYNTHETIC_CONFIG, noise_delay: -1};
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('noise_delay must be non-negative');
    });

    test('rejects negative noise_doppler', () => {
      const config = {...DEFAULT_SYNTHETIC_CONFIG, noise_doppler: -1};
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('noise_doppler must be non-negative');
    });

    test('rejects snr_min > snr_max', () => {
      const config = {...DEFAULT_SYNTHETIC_CONFIG, snr_min: 25, snr_max: 10};
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('snr_min must be <= snr_max');
    });

    test('rejects invalid detection_prob', () => {
      const config1 = {...DEFAULT_SYNTHETIC_CONFIG, detection_prob: -0.1};
      const result1 = validateSyntheticConfig(config1);
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('detection_prob must be in [0, 1]');

      const config2 = {...DEFAULT_SYNTHETIC_CONFIG, detection_prob: 1.5};
      const result2 = validateSyntheticConfig(config2);
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('detection_prob must be in [0, 1]');
    });

    test('rejects negative false_alarm_rate', () => {
      const config = {...DEFAULT_SYNTHETIC_CONFIG, false_alarm_rate: -1};
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('false_alarm_rate must be non-negative');
    });

    test('rejects invalid frame_interval', () => {
      const config = {...DEFAULT_SYNTHETIC_CONFIG, frame_interval: 0};
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('frame_interval must be positive');
    });

    test('rejects invalid duration', () => {
      const config = {...DEFAULT_SYNTHETIC_CONFIG, duration: 0};
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('duration must be positive');
    });

    test('rejects invalid delay range', () => {
      const config = {...DEFAULT_SYNTHETIC_CONFIG, delay_min: 100, delay_max: 50};
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('delay_min must be < delay_max');
    });

    test('rejects invalid doppler range', () => {
      const config = {...DEFAULT_SYNTHETIC_CONFIG, doppler_min: 100, doppler_max: -100};
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('doppler_min must be < doppler_max');
    });

    test('accumulates multiple validation errors', () => {
      const config = {
        ...DEFAULT_SYNTHETIC_CONFIG,
        noise_delay: -1,
        detection_prob: 2.0,
        duration: -5
      };
      const result = validateSyntheticConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Frame generation', () => {
    test('generates frame with aircraft detections', () => {
      const aircraftDict = {
        'abc123': {
          delay: 100.0,
          doppler: 50.0,
          flight: 'UAL123'
        },
        'def456': {
          delay: 200.0,
          doppler: -75.0,
          flight: 'DAL456'
        }
      };

      const config = {...DEFAULT_SYNTHETIC_CONFIG, detection_prob: 1.0, false_alarm_rate: 0};
      const rng = new SyntheticRNG(42);
      const timestamp = Date.now();

      const frame = generateSyntheticFrame(aircraftDict, timestamp, config, rng);

      expect(frame.timestamp).toBe(timestamp);
      expect(frame.delay.length).toBe(2);
      expect(frame.doppler.length).toBe(2);
      expect(frame.snr.length).toBe(2);
      expect(frame.adsb.length).toBe(2);

      expect(frame.snr[0]).toBeGreaterThanOrEqual(config.snr_min);
      expect(frame.snr[0]).toBeLessThanOrEqual(config.snr_max);
    });

    test('applies gaussian noise to measurements', () => {
      const aircraftDict = {
        'abc123': {
          delay: 100.0,
          doppler: 50.0,
          flight: 'UAL123'
        }
      };

      const config = {
        ...DEFAULT_SYNTHETIC_CONFIG,
        noise_delay: 0.5,
        noise_doppler: 2.0,
        detection_prob: 1.0,
        false_alarm_rate: 0
      };

      const frames = [];
      for (let i = 0; i < 1000; i++) {
        const rng = new SyntheticRNG(1000 + i);
        const frame = generateSyntheticFrame(aircraftDict, Date.now(), config, rng);
        frames.push(frame);
      }

      const delayErrors = frames.map(f => f.delay[0] - 100.0);
      const dopplerErrors = frames.map(f => f.doppler[0] - 50.0);

      const delayMean = delayErrors.reduce((a, b) => a + b, 0) / delayErrors.length;
      const dopplerMean = dopplerErrors.reduce((a, b) => a + b, 0) / dopplerErrors.length;

      expect(delayMean).toBeCloseTo(0, 0);
      expect(dopplerMean).toBeCloseTo(0, 0);

      const delayStd = Math.sqrt(
        delayErrors.reduce((sum, x) => sum + (x - delayMean) ** 2, 0) / delayErrors.length
      );
      const dopplerStd = Math.sqrt(
        dopplerErrors.reduce((sum, x) => sum + (x - dopplerMean) ** 2, 0) / dopplerErrors.length
      );

      expect(delayStd).toBeCloseTo(config.noise_delay, 0);
      expect(dopplerStd).toBeCloseTo(config.noise_doppler, 0);
    });

    test('respects detection probability', () => {
      const aircraftDict = {
        'abc123': {delay: 100.0, doppler: 50.0, flight: 'UAL123'},
        'def456': {delay: 200.0, doppler: -75.0, flight: 'DAL456'},
        'ghi789': {delay: 150.0, doppler: 25.0, flight: 'AAL789'}
      };

      const config = {
        ...DEFAULT_SYNTHETIC_CONFIG,
        detection_prob: 0.7,
        false_alarm_rate: 0
      };

      const detectionCounts = [];
      for (let i = 0; i < 500; i++) {
        const rng = new SyntheticRNG(2000 + i);
        const frame = generateSyntheticFrame(aircraftDict, Date.now(), config, rng);
        detectionCounts.push(frame.delay.length);
      }

      const meanDetections = detectionCounts.reduce((a, b) => a + b, 0) / detectionCounts.length;
      const expectedDetections = Object.keys(aircraftDict).length * config.detection_prob;

      expect(meanDetections).toBeCloseTo(expectedDetections, 0);
    });

    test('generates false alarms according to Poisson distribution', () => {
      const config = {
        ...DEFAULT_SYNTHETIC_CONFIG,
        detection_prob: 0,
        false_alarm_rate: 3.0
      };

      const falseCounts = [];
      for (let i = 0; i < 500; i++) {
        const rng = new SyntheticRNG(3000 + i);
        const frame = generateSyntheticFrame({}, Date.now(), config, rng);
        falseCounts.push(frame.delay.length);
      }

      const meanFalseAlarms = falseCounts.reduce((a, b) => a + b, 0) / falseCounts.length;
      expect(meanFalseAlarms).toBeCloseTo(config.false_alarm_rate, 0);
    });

    test('false alarms have null ADS-B data', () => {
      const config = {
        ...DEFAULT_SYNTHETIC_CONFIG,
        detection_prob: 0,
        false_alarm_rate: 5.0
      };

      const rng = new SyntheticRNG(42);
      const frame = generateSyntheticFrame({}, Date.now(), config, rng);

      const nullCount = frame.adsb.filter(a => a === null).length;
      expect(nullCount).toBe(frame.delay.length);
    });

    test('skips aircraft with missing delay or doppler', () => {
      const aircraftDict = {
        'abc123': {delay: 100.0, doppler: 50.0, flight: 'UAL123'},
        'def456': {doppler: -75.0, flight: 'DAL456'},
        'ghi789': {delay: 150.0, flight: 'AAL789'}
      };

      const config = {...DEFAULT_SYNTHETIC_CONFIG, detection_prob: 1.0, false_alarm_rate: 0};
      const rng = new SyntheticRNG(42);
      const frame = generateSyntheticFrame(aircraftDict, Date.now(), config, rng);

      expect(frame.delay.length).toBe(1);
    });

    test('includes ADS-B metadata for aircraft detections', () => {
      const aircraftDict = {
        'abc123': {
          delay: 100.0,
          doppler: 50.0,
          flight: 'UAL123'
        }
      };

      const config = {...DEFAULT_SYNTHETIC_CONFIG, detection_prob: 1.0, false_alarm_rate: 0};
      const rng = new SyntheticRNG(42);
      const frame = generateSyntheticFrame(aircraftDict, Date.now(), config, rng);

      expect(frame.adsb[0]).toEqual({
        hex: 'abc123',
        flight: 'UAL123'
      });
    });
  });

  describe('Frame format conversion', () => {
    test('converts aircraft dict to frame format', () => {
      const aircraftDict = {
        'abc123': {delay: 100.0, doppler: 50.0, flight: 'UAL123'},
        'def456': {delay: 200.0, doppler: -75.0, flight: 'DAL456'}
      };

      const aircraftRawData = {
        aircraft: [
          {hex: 'abc123', lat: 37.77, lon: -122.42, alt_baro: 5000, gs: 250, track: 45},
          {hex: 'def456', lat: 37.81, lon: -122.34, alt_baro: 8500, gs: 300, track: 120}
        ]
      };

      const timestamp = Date.now();
      const frame = convertToFrameFormat(aircraftDict, aircraftRawData, timestamp);

      expect(frame.timestamp).toBe(timestamp);
      expect(frame.delay).toEqual([100.0, 200.0]);
      expect(frame.doppler).toEqual([50.0, -75.0]);
      expect(frame.snr).toEqual([15.0, 15.0]);
      expect(frame.adsb.length).toBe(2);
      expect(frame.adsb[0].hex).toBe('abc123');
      expect(frame.adsb[0].lat).toBe(37.77);
      expect(frame.adsb[1].hex).toBe('def456');
    });

    test('handles missing raw data gracefully', () => {
      const aircraftDict = {
        'abc123': {delay: 100.0, doppler: 50.0, flight: 'UAL123'}
      };

      const timestamp = Date.now();
      const frame = convertToFrameFormat(aircraftDict, null, timestamp);

      expect(frame.adsb[0]).toEqual({
        hex: 'abc123',
        flight: 'UAL123'
      });
    });

    test('uses alt_geom fallback when alt_baro missing', () => {
      const aircraftDict = {
        'abc123': {delay: 100.0, doppler: 50.0, flight: 'UAL123'}
      };

      const aircraftRawData = {
        aircraft: [
          {hex: 'abc123', lat: 37.77, lon: -122.42, alt_geom: 5100, gs: 250, track: 45}
        ]
      };

      const timestamp = Date.now();
      const frame = convertToFrameFormat(aircraftDict, aircraftRawData, timestamp);

      expect(frame.adsb[0].alt_baro).toBe(5100);
    });

    test('skips aircraft with missing delay or doppler', () => {
      const aircraftDict = {
        'abc123': {delay: 100.0, doppler: 50.0, flight: 'UAL123'},
        'def456': {doppler: -75.0, flight: 'DAL456'}
      };

      const aircraftRawData = {
        aircraft: [
          {hex: 'abc123', lat: 37.77, lon: -122.42, alt_baro: 5000, gs: 250, track: 45},
          {hex: 'def456', lat: 37.81, lon: -122.34, alt_baro: 8500, gs: 300, track: 120}
        ]
      };

      const timestamp = Date.now();
      const frame = convertToFrameFormat(aircraftDict, aircraftRawData, timestamp);

      expect(frame.delay.length).toBe(1);
      expect(frame.adsb[0].hex).toBe('abc123');
    });
  });
});

describe('Mach 5 Trajectory Generation', () => {
  test('generateMach5Trajectory produces correct number of positions', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 60, 1.0
    );

    expect(trajectory.length).toBe(60);
  });

  test('generateMach5Trajectory has consistent speed', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 10, 1.0
    );

    for (const pos of trajectory) {
      expect(pos.speed).toBe(1715);
      expect(pos.gs).toBeCloseTo(1715 * 1.94384, 1);
    }
  });

  test('generateMach5Trajectory moves in correct direction', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 10, 1.0
    );

    const startLon = trajectory[0].lon;
    const endLon = trajectory[trajectory.length - 1].lon;

    expect(endLon).toBeGreaterThan(startLon);
  });

  test('generateMach5Trajectory maintains altitude', () => {
    const altitude = 15000;
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, altitude, 90, 10, 1.0
    );

    for (const pos of trajectory) {
      expect(pos.alt).toBe(altitude);
    }
  });

  test('generateMach5Trajectory has correct ADS-B fields', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 10, 1.0
    );

    for (const pos of trajectory) {
      expect(pos.hex).toBe('MACH5X');
      expect(pos.flight).toBe('MACH5');
      expect(pos.track).toBe(90);
      expect(pos).toHaveProperty('alt_baro');
      expect(pos).toHaveProperty('timestamp');
    }
  });

  test('trajectoryToDelayDoppler produces detections', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 10, 1.0
    );

    const detections = trajectoryToDelayDoppler(
      trajectory, 37.7644, -122.3954, 23, 37.49917, -121.87222, 783, 503
    );

    expect(detections.length).toBe(trajectory.length);
  });

  test('trajectoryToDelayDoppler computes delay correctly', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 10, 1.0
    );

    const detections = trajectoryToDelayDoppler(
      trajectory, 37.7644, -122.3954, 23, 37.49917, -121.87222, 783, 503
    );

    for (const detection of detections) {
      expect(detection.delay).toBeGreaterThan(0);
      expect(detection.delay).toBeLessThan(1000);
    }
  });

  test('trajectoryToDelayDoppler computes Doppler for high-speed target', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 10, 1.0
    );

    const detections = trajectoryToDelayDoppler(
      trajectory, 37.7644, -122.3954, 23, 37.49917, -121.87222, 783, 503
    );

    const dopplerValues = detections.slice(1).map(d => Math.abs(d.doppler));
    const maxDoppler = Math.max(...dopplerValues);

    expect(maxDoppler).toBeGreaterThan(100);
  });

  test('trajectoryToDelayDoppler includes ADS-B metadata', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 10, 1.0
    );

    const detections = trajectoryToDelayDoppler(
      trajectory, 37.7644, -122.3954, 23, 37.49917, -121.87222, 783, 503
    );

    for (const detection of detections) {
      expect(detection.adsb).toHaveProperty('hex');
      expect(detection.adsb).toHaveProperty('lat');
      expect(detection.adsb).toHaveProperty('lon');
      expect(detection.adsb).toHaveProperty('alt_baro');
      expect(detection.adsb).toHaveProperty('gs');
      expect(detection.adsb).toHaveProperty('track');
      expect(detection.adsb).toHaveProperty('flight');
    }
  });

  test('Mach 5 trajectory covers significant distance', () => {
    const trajectory = generateMach5Trajectory(
      37.7, -122.4, 15000, 90, 60, 1.0
    );

    const start = trajectory[0];
    const end = trajectory[trajectory.length - 1];

    const latDiff = Math.abs(end.lat - start.lat);
    const lonDiff = Math.abs(end.lon - start.lon);

    expect(latDiff + lonDiff).toBeGreaterThan(0.5);
  });
});
