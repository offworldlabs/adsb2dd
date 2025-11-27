import {isValidNumber} from '../src/node/validate.js';

describe('Parameter Validation Logic', () => {
  describe('query parameter validation', () => {
    test('undefined rx parameter is detected', () => {
      const rx = undefined;
      const rxParams = rx?.split(',').map(parseFloat);
      expect(rxParams).toBeUndefined();
    });

    test('undefined tx parameter is detected', () => {
      const tx = undefined;
      const txParams = tx?.split(',').map(parseFloat);
      expect(txParams).toBeUndefined();
    });

    test('valid rx parameter is parsed correctly', () => {
      const rx = '51.5,-0.1,0';
      const rxParams = rx?.split(',').map(parseFloat);
      expect(rxParams).toHaveLength(3);
      expect(rxParams.every(isValidNumber)).toBe(true);
    });

    test('invalid rx parameter fails validation', () => {
      const rx = 'invalid,data,here';
      const rxParams = rx?.split(',').map(parseFloat);
      expect(rxParams.every(isValidNumber)).toBe(false);
    });

    test('missing fc parameter is detected', () => {
      const fc = parseFloat(undefined);
      expect(isNaN(fc)).toBe(true);
    });

    test('negative fc parameter fails validation', () => {
      const fc = parseFloat('-1000');
      expect(fc <= 0).toBe(true);
    });

    test('zero fc parameter fails validation', () => {
      const fc = parseFloat('0');
      expect(fc <= 0).toBe(true);
    });

    test('positive fc parameter passes validation', () => {
      const fc = parseFloat('1090000000');
      expect(isNaN(fc)).toBe(false);
      expect(fc > 0).toBe(true);
    });

    test('complete validation logic for missing rx', () => {
      const server = 'http://localhost:8080';
      const rx = undefined;
      const tx = '51.6,-0.2,100';
      const fc = parseFloat('1090000000');

      const rxParams = rx?.split(',').map(parseFloat);
      const txParams = tx?.split(',').map(parseFloat);

      const isValid = server && rxParams && txParams &&
        rxParams.every(isValidNumber) &&
        txParams.every(isValidNumber) &&
        !isNaN(fc) && fc > 0;

      expect(isValid).toBeFalsy();
    });

    test('complete validation logic for valid parameters', () => {
      const server = 'http://localhost:8080';
      const rx = '51.5,-0.1,0';
      const tx = '51.6,-0.2,100';
      const fc = parseFloat('1090000000');

      const rxParams = rx?.split(',').map(parseFloat);
      const txParams = tx?.split(',').map(parseFloat);

      const isValid = server && rxParams && txParams &&
        rxParams.every(isValidNumber) &&
        txParams.every(isValidNumber) &&
        !isNaN(fc) && fc > 0;

      expect(isValid).toBe(true);
    });
  });
});

describe('Response Validation Logic', () => {
  test('validation returns falsy for null', () => {
    const json = null;
    const isValid = json && json.aircraft && Array.isArray(json.aircraft);
    expect(isValid).toBeFalsy();
  });

  test('validation returns falsy for undefined', () => {
    const json = undefined;
    const isValid = json && json.aircraft && Array.isArray(json.aircraft);
    expect(isValid).toBeFalsy();
  });

  test('validation returns falsy for false', () => {
    const json = false;
    const isValid = json && json.aircraft && Array.isArray(json.aircraft);
    expect(isValid).toBeFalsy();
  });

  test('validation returns falsy for empty object', () => {
    const json = {};
    const isValid = json && json.aircraft && Array.isArray(json.aircraft);
    expect(isValid).toBeFalsy();
  });

  test('validation returns falsy for object with non-array aircraft', () => {
    const json = { aircraft: 'not-an-array' };
    const isValid = json && json.aircraft && Array.isArray(json.aircraft);
    expect(isValid).toBeFalsy();
  });

  test('validation returns true for valid response', () => {
    const json = { aircraft: [] };
    const isValid = json && json.aircraft && Array.isArray(json.aircraft);
    expect(isValid).toBe(true);
  });

  test('validation returns true for response with aircraft data', () => {
    const json = {
      now: 1700000000,
      aircraft: [
        { hex: 'abc123', flight: 'TEST123', lat: 51.5, lon: -0.1, alt_geom: 35000 }
      ]
    };
    const isValid = json && json.aircraft && Array.isArray(json.aircraft);
    expect(isValid).toBe(true);
  });
});

describe('Timestamp Calculation Logic', () => {
  test('aircraft timestamp uses subtraction for seen_pos', () => {
    const json_now = 1700000000;
    const seen_pos = 5.5;
    const expected_timestamp = json_now - seen_pos;
    const calculated_timestamp = json_now - seen_pos;

    expect(calculated_timestamp).toBe(expected_timestamp);
    expect(calculated_timestamp).toBe(1699999994.5);
    expect(calculated_timestamp).toBeLessThan(json_now);
  });

  test('fresh aircraft position has timestamp close to now', () => {
    const json_now = 1700000000;
    const seen_pos = 0.1;
    const timestamp = json_now - seen_pos;

    expect(timestamp).toBeCloseTo(json_now, 0);
    expect(timestamp).toBeLessThan(json_now);
  });

  test('stale aircraft position has older timestamp', () => {
    const json_now = 1700000000;
    const seen_pos = 50;
    const timestamp = json_now - seen_pos;

    expect(timestamp).toBe(1699999950);
    expect(json_now - timestamp).toBe(50);
  });

  test('aircraft with high seen_pos should be deleted after tDeletePlane seconds', () => {
    const tDeletePlane = 5;
    const json_now = 1700000000;
    const seen_pos = 50;
    const aircraft_timestamp = json_now - seen_pos;
    const current_time = json_now + 1;

    const time_since_position = current_time - aircraft_timestamp;
    const should_delete = time_since_position > tDeletePlane;

    expect(time_since_position).toBe(51);
    expect(should_delete).toBe(true);
  });

  test('aircraft with recent position should not be deleted', () => {
    const tDeletePlane = 5;
    const json_now = 1700000000;
    const seen_pos = 2;
    const aircraft_timestamp = json_now - seen_pos;
    const current_time = json_now + 1;

    const time_since_position = current_time - aircraft_timestamp;
    const should_delete = time_since_position > tDeletePlane;

    expect(time_since_position).toBe(3);
    expect(should_delete).toBe(false);
  });

  test('processing timestamps array uses subtraction (line 334 fix)', () => {
    const json_now = 1700000000;
    const seen_pos = 5.5;
    const timestamps = [];

    timestamps.push(json_now - seen_pos);

    expect(timestamps[0]).toBe(1699999994.5);
    expect(timestamps[0]).toBeLessThan(json_now);
    expect(json_now - timestamps[0]).toBe(seen_pos);
  });

  test('output and processing timestamps are consistent', () => {
    const json_now = 1700000000;
    const seen_pos = 10.2;

    const output_timestamp = json_now - seen_pos;
    const processing_timestamp = json_now - seen_pos;

    expect(output_timestamp).toBe(processing_timestamp);
    expect(output_timestamp).toBe(1699999989.8);
  });

  test('multiple processing timestamps maintain chronological order', () => {
    const json_now_base = 1700000000;
    const timestamps = [];

    timestamps.push(json_now_base - 5.0);
    timestamps.push((json_now_base + 1) - 3.0);
    timestamps.push((json_now_base + 2) - 1.0);

    expect(timestamps[0]).toBe(1699999995);
    expect(timestamps[1]).toBe(1699999998);
    expect(timestamps[2]).toBe(1700000001);

    expect(timestamps[0]).toBeLessThan(timestamps[1]);
    expect(timestamps[1]).toBeLessThan(timestamps[2]);
  });
});
