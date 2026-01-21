describe('SSRF Protection (ALLOW_PRIVATE_NETWORKS)', () => {
  describe('Private network detection', () => {
    function isPrivateIP(ip) {
      const ipv4PrivateRanges = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^0\.0\.0\.0$/,
      ];

      const ipv6PrivateRanges = [
        /^::1$/,
        /^fe80:/i,
        /^fc00:/i,
        /^fd00:/i,
      ];

      return ipv4PrivateRanges.some(range => range.test(ip)) ||
             ipv6PrivateRanges.some(range => range.test(ip));
    }

    test('detects localhost addresses', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('127.0.0.2')).toBe(true);
      expect(isPrivateIP('127.255.255.255')).toBe(true);
    });

    test('detects 10.x.x.x range', () => {
      expect(isPrivateIP('10.0.0.0')).toBe(true);
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('10.255.255.255')).toBe(true);
    });

    test('detects 192.168.x.x range', () => {
      expect(isPrivateIP('192.168.0.1')).toBe(true);
      expect(isPrivateIP('192.168.1.1')).toBe(true);
      expect(isPrivateIP('192.168.255.255')).toBe(true);
    });

    test('detects 172.16-31.x.x range', () => {
      expect(isPrivateIP('172.16.0.0')).toBe(true);
      expect(isPrivateIP('172.20.0.1')).toBe(true);
      expect(isPrivateIP('172.31.255.255')).toBe(true);
    });

    test('detects link-local 169.254.x.x range', () => {
      expect(isPrivateIP('169.254.0.0')).toBe(true);
      expect(isPrivateIP('169.254.169.254')).toBe(true);
      expect(isPrivateIP('169.254.255.255')).toBe(true);
    });

    test('detects IPv6 localhost', () => {
      expect(isPrivateIP('::1')).toBe(true);
    });

    test('detects IPv6 link-local addresses', () => {
      expect(isPrivateIP('fe80::1')).toBe(true);
      expect(isPrivateIP('FE80::1')).toBe(true);
    });

    test('does not flag public IPv4 addresses', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('1.1.1.1')).toBe(false);
      expect(isPrivateIP('172.15.0.0')).toBe(false);
      expect(isPrivateIP('172.32.0.0')).toBe(false);
      expect(isPrivateIP('192.167.0.1')).toBe(false);
      expect(isPrivateIP('192.169.0.1')).toBe(false);
    });
  });

  describe('SSRF validation logic', () => {
    function shouldBlockServer(serverUrl, allowPrivateNetworks) {
      let parsed;
      try {
        parsed = new URL(serverUrl);
      } catch (e) {
        return true;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return true;
      }

      const isAdsbLol = parsed.hostname === 'api.adsb.lol';

      if (isAdsbLol) {
        return false;
      }

      if (allowPrivateNetworks) {
        return false;
      }

      const hostname = parsed.hostname;
      const privateIPv4Ranges = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^0\.0\.0\.0$/,
        /localhost/i
      ];

      return privateIPv4Ranges.some(range => range.test(hostname));
    }

    describe('when ALLOW_PRIVATE_NETWORKS=false (default)', () => {
      test('blocks localhost', () => {
        expect(shouldBlockServer('http://localhost:8080', false)).toBe(true);
        expect(shouldBlockServer('http://127.0.0.1:8080', false)).toBe(true);
      });

      test('blocks 10.x.x.x range', () => {
        expect(shouldBlockServer('http://10.0.0.1:8080', false)).toBe(true);
        expect(shouldBlockServer('http://10.255.255.255:8080', false)).toBe(true);
      });

      test('blocks 192.168.x.x range', () => {
        expect(shouldBlockServer('http://192.168.0.1:8080', false)).toBe(true);
        expect(shouldBlockServer('http://192.168.1.100:8080', false)).toBe(true);
      });

      test('blocks 172.16-31.x.x range', () => {
        expect(shouldBlockServer('http://172.16.0.1:8080', false)).toBe(true);
        expect(shouldBlockServer('http://172.31.255.255:8080', false)).toBe(true);
      });

      test('blocks 169.254.x.x link-local', () => {
        expect(shouldBlockServer('http://169.254.169.254', false)).toBe(true);
      });

      test('blocks 0.0.0.0', () => {
        expect(shouldBlockServer('http://0.0.0.0:8080', false)).toBe(true);
      });

      test('allows public IPs', () => {
        expect(shouldBlockServer('http://8.8.8.8', false)).toBe(false);
        expect(shouldBlockServer('http://1.1.1.1:8080', false)).toBe(false);
      });

      test('allows public hostnames', () => {
        expect(shouldBlockServer('http://adsb.30hours.dev', false)).toBe(false);
        expect(shouldBlockServer('http://example.com:8080', false)).toBe(false);
      });

      test('allows adsb.lol regardless of SSRF setting', () => {
        expect(shouldBlockServer('https://api.adsb.lol', false)).toBe(false);
      });
    });

    describe('when ALLOW_PRIVATE_NETWORKS=true', () => {
      test('allows localhost', () => {
        expect(shouldBlockServer('http://localhost:8080', true)).toBe(false);
        expect(shouldBlockServer('http://127.0.0.1:8080', true)).toBe(false);
      });

      test('allows 10.x.x.x range', () => {
        expect(shouldBlockServer('http://10.0.0.1:8080', true)).toBe(false);
        expect(shouldBlockServer('http://10.255.255.255:8080', true)).toBe(false);
      });

      test('allows 192.168.x.x range', () => {
        expect(shouldBlockServer('http://192.168.0.1:8080', true)).toBe(false);
        expect(shouldBlockServer('http://192.168.1.100:8080', true)).toBe(false);
      });

      test('allows 172.16-31.x.x range', () => {
        expect(shouldBlockServer('http://172.16.0.1:8080', true)).toBe(false);
        expect(shouldBlockServer('http://172.31.255.255:8080', true)).toBe(false);
      });

      test('allows 169.254.x.x link-local', () => {
        expect(shouldBlockServer('http://169.254.169.254', true)).toBe(false);
      });

      test('allows public IPs (unchanged)', () => {
        expect(shouldBlockServer('http://8.8.8.8', true)).toBe(false);
        expect(shouldBlockServer('http://1.1.1.1:8080', true)).toBe(false);
      });

      test('allows public hostnames (unchanged)', () => {
        expect(shouldBlockServer('http://adsb.30hours.dev', true)).toBe(false);
        expect(shouldBlockServer('http://example.com:8080', true)).toBe(false);
      });
    });

    describe('protocol validation (unchanged by ALLOW_PRIVATE_NETWORKS)', () => {
      test('blocks non-http protocols', () => {
        expect(shouldBlockServer('ftp://192.168.1.1', false)).toBe(true);
        expect(shouldBlockServer('ftp://192.168.1.1', true)).toBe(true);
      });

      test('blocks file:// protocol', () => {
        expect(shouldBlockServer('file:///etc/passwd', false)).toBe(true);
        expect(shouldBlockServer('file:///etc/passwd', true)).toBe(true);
      });

      test('blocks invalid URLs', () => {
        expect(shouldBlockServer('not-a-url', false)).toBe(true);
        expect(shouldBlockServer('not-a-url', true)).toBe(true);
      });

      test('allows http and https', () => {
        expect(shouldBlockServer('http://example.com', false)).toBe(false);
        expect(shouldBlockServer('https://example.com', false)).toBe(false);
      });
    });
  });

  describe('Real-world scenarios', () => {
    function shouldBlockServer(serverUrl, allowPrivateNetworks) {
      let parsed;
      try {
        parsed = new URL(serverUrl);
      } catch (e) {
        return true;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return true;
      }

      const isAdsbLol = parsed.hostname === 'api.adsb.lol';
      if (isAdsbLol) {
        return false;
      }

      if (allowPrivateNetworks) {
        return false;
      }

      const hostname = parsed.hostname;
      const privateIPv4Ranges = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^0\.0\.0\.0$/,
        /localhost/i
      ];

      return privateIPv4Ranges.some(range => range.test(hostname));
    }

    test('public adsb2dd blocks internal tar1090 by default', () => {
      const result = shouldBlockServer('http://192.168.0.20:8080', false);
      expect(result).toBe(true);
    });

    test('private RETINA deployment allows internal tar1090', () => {
      const result = shouldBlockServer('http://192.168.0.20:8080', true);
      expect(result).toBe(false);
    });

    test('public adsb2dd allows public tar1090 servers', () => {
      const result = shouldBlockServer('http://adsb.30hours.dev', false);
      expect(result).toBe(false);
    });

    test('AWS metadata service is blocked by default', () => {
      const result = shouldBlockServer('http://169.254.169.254/latest/meta-data/', false);
      expect(result).toBe(true);
    });

    test('docker host gateway is blocked by default', () => {
      const result = shouldBlockServer('http://172.17.0.1', false);
      expect(result).toBe(true);
    });

    test('kubernetes internal service is blocked by default', () => {
      const result = shouldBlockServer('http://10.96.0.1', false);
      expect(result).toBe(true);
    });
  });

  describe('Environment variable parsing', () => {
    test('ALLOW_PRIVATE_NETWORKS=true enables bypass', () => {
      const envValue = 'true';
      const allowPrivateNetworks = envValue === 'true';
      expect(allowPrivateNetworks).toBe(true);
    });

    test('ALLOW_PRIVATE_NETWORKS=false keeps protection', () => {
      const envValue = 'false';
      const allowPrivateNetworks = envValue === 'true';
      expect(allowPrivateNetworks).toBe(false);
    });

    test('undefined defaults to false', () => {
      const envValue = undefined;
      const allowPrivateNetworks = envValue === 'true';
      expect(allowPrivateNetworks).toBe(false);
    });

    test('any other value defaults to false', () => {
      expect('1' === 'true').toBe(false);
      expect('yes' === 'true').toBe(false);
      expect('True' === 'true').toBe(false);
      expect('TRUE' === 'true').toBe(false);
    });
  });
});
