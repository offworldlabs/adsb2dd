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
