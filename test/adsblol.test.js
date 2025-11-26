describe('adsblol.js Module Tests', () => {
  describe('validateParameters function', () => {
    // Note: validateParameters is internal, so we test it through the exported functions

    test('checkAdsbLol rejects latitude above 90', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      const result = await checkAdsbLol(91, 0, 40);
      expect(result).toBe(false);
    });

    test('checkAdsbLol rejects latitude below -90', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      const result = await checkAdsbLol(-91, 0, 40);
      expect(result).toBe(false);
    });

    test('checkAdsbLol rejects longitude above 180', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      const result = await checkAdsbLol(0, 181, 40);
      expect(result).toBe(false);
    });

    test('checkAdsbLol rejects longitude below -180', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      const result = await checkAdsbLol(0, -181, 40);
      expect(result).toBe(false);
    });

    test('checkAdsbLol rejects radius above 250nm', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      const result = await checkAdsbLol(51.5, -0.1, 251);
      expect(result).toBe(false);
    });

    test('checkAdsbLol rejects zero radius', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      const result = await checkAdsbLol(51.5, -0.1, 0);
      expect(result).toBe(false);
    });

    test('checkAdsbLol rejects negative radius', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      const result = await checkAdsbLol(51.5, -0.1, -10);
      expect(result).toBe(false);
    });

    test('checkAdsbLol rejects non-number latitude', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      const result = await checkAdsbLol('invalid', 0, 40);
      expect(result).toBe(false);
    });

    test('checkAdsbLol accepts valid parameters', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      // This will make a real API call, so we just verify it doesn't reject the params
      // The actual API response is tested separately
      const result = await checkAdsbLol(51.5, -0.1, 40);
      // Result can be true or false depending on API availability
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getAdsbLol function', () => {
    test('getAdsbLol returns empty structure for invalid latitude', async () => {
      const { getAdsbLol } = await import('../src/node/adsblol.js');
      const result = await getAdsbLol(91, 0, 40);
      expect(result).toHaveProperty('now');
      expect(result).toHaveProperty('messages', 0);
      expect(result).toHaveProperty('aircraft');
      expect(Array.isArray(result.aircraft)).toBe(true);
      expect(result.aircraft).toHaveLength(0);
    });

    test('getAdsbLol returns empty structure for invalid longitude', async () => {
      const { getAdsbLol } = await import('../src/node/adsblol.js');
      const result = await getAdsbLol(0, 181, 40);
      expect(result).toHaveProperty('now');
      expect(result).toHaveProperty('messages', 0);
      expect(result).toHaveProperty('aircraft');
      expect(Array.isArray(result.aircraft)).toBe(true);
    });

    test('getAdsbLol returns empty structure for invalid radius', async () => {
      const { getAdsbLol } = await import('../src/node/adsblol.js');
      const result = await getAdsbLol(51.5, -0.1, 300);
      expect(result).toHaveProperty('now');
      expect(result).toHaveProperty('messages', 0);
      expect(result.aircraft).toHaveLength(0);
    });

    test('getAdsbLol returns valid structure for valid parameters', async () => {
      const { getAdsbLol } = await import('../src/node/adsblol.js');
      const result = await getAdsbLol(51.5, -0.1, 40);

      // Verify structure matches tar1090 format
      expect(result).toHaveProperty('now');
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('aircraft');
      expect(Array.isArray(result.aircraft)).toBe(true);

      // Verify timestamp is in seconds (not milliseconds)
      expect(typeof result.now).toBe('number');
      expect(result.now).toBeGreaterThan(1000000000); // After year 2000
      expect(result.now).toBeLessThan(2000000000); // Before year 2033
    });

    test('getAdsbLol normalizes adsb.lol response to tar1090 format', async () => {
      const { getAdsbLol } = await import('../src/node/adsblol.js');
      const result = await getAdsbLol(51.5, -0.1, 40);

      // Verify no 'ac' key (adsb.lol format)
      expect(result).not.toHaveProperty('ac');

      // Verify has 'aircraft' key (tar1090 format)
      expect(result).toHaveProperty('aircraft');

      // Verify 'messages' not 'total'
      expect(result).toHaveProperty('messages');
      expect(result).not.toHaveProperty('total');
    });
  });

  describe('Data normalization', () => {
    test('timestamp conversion handles milliseconds correctly', async () => {
      const { getAdsbLol } = await import('../src/node/adsblol.js');
      const result = await getAdsbLol(51.5, -0.1, 40);

      // adsb.lol returns milliseconds (> 1e12), should be converted to seconds
      // Verify result is in seconds range (1e9 - 2e9)
      expect(result.now).toBeLessThan(2e12); // Not in milliseconds
      expect(result.now).toBeGreaterThan(1e9); // In seconds range
    });
  });

  describe('Error handling', () => {
    test('checkAdsbLol handles network errors gracefully', async () => {
      const { checkAdsbLol } = await import('../src/node/adsblol.js');
      // Using invalid coordinates that pass validation but might fail API call
      const result = await checkAdsbLol(0, 0, 1);
      // Should return boolean, not throw
      expect(typeof result).toBe('boolean');
    });

    test('getAdsbLol handles errors without throwing', async () => {
      const { getAdsbLol } = await import('../src/node/adsblol.js');
      // Should not throw, even with edge case coordinates
      await expect(getAdsbLol(0, 0, 1)).resolves.toBeDefined();
    });
  });
});
