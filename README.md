# adsb2dd

Convert ADSB data to delay-Doppler truth - see a live instance at [http://adsb2dd.30hours.dev](http://adsb2dd.30hours.dev).

## Features

- Provides an API to input receiver/transmitter coordinates, radar center frequency and [tar1090](https://github.com/wiedehopf/tar1090) server.
- A web front-end calculator is provided to generate a correct API endpoint.
- Outputs JSON data with a delay in km and Doppler in Hz.
- Use the JSON output to map truth onto a delay-Doppler map, for example in [blah2](http://github.com/30hours/blah2).

## Building Docker Images (CI/CD)

To build and publish Docker images via GitHub Actions:

**Manual build (dev/testing):**
1. Go to Actions → `docker-build` workflow
2. Click "Run workflow"
3. Set `tag` (e.g., `dev` or `v1.0.0`)
4. Set `publish` to `true` to push to GHCR

**Release build (production):**
1. Create and push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. The `release` workflow will automatically build and publish to `ghcr.io/offworldlabs/adsb2dd:<tag>`

**Pull the image:**
```bash
docker pull ghcr.io/offworldlabs/adsb2dd:v1.0.0
```

## Usage

- Install docker and docker-compose on the host machine.
- Clone this repository to some directory.
- Run the docker compose command.

```
sudo git clone http://github.com/30hours/blah2 /opt/adsb2dd
cd /opt/adsb2dd
sudo docker compose up -d
```

The API front-end is available at [http://localhost:49155](http://localhost:49155).

## Security Considerations

**SSRF (Server-Side Request Forgery) Risk:** This service accepts user-provided URLs via the `server` parameter and makes HTTP requests to those URLs. This implementation does not include SSRF protection for simplicity in internal trusted network deployments.

### Potential Attack Vectors

If this service is exposed to untrusted users or networks, attackers could potentially:

- **Access cloud metadata services** (e.g., AWS at 169.254.169.254) to steal credentials
- **Scan internal networks** to discover internal services and infrastructure
- **Access internal services** that are not internet-facing
- **Bypass firewall rules** by using this service as a proxy

### Recommendations

1. **Deploy only on trusted internal networks** - Do not expose this service to the public internet
2. **Implement network segmentation** - Limit what networks this service can reach
3. **Add authentication** - Require authentication for API access if needed
4. **Monitor for abuse** - Log and review access patterns
5. **Security audit** - Conduct a security audit before production deployment

For production deployments requiring public access, consider implementing:
- Private network IP blocking (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x, 169.254.x.x)
- DNS resolution validation
- Request rate limiting
- URL allowlisting

## Method of Operation

The delay-Doppler data is computed as follows:

- The [tar1090](https://github.com/wiedehopf/tar1090) server provides the latitude, longitude and altitude of aircraft at the endpoint `/data/aircraft.json` - an example from a live server is [http://adsb.30hours.dev/data/aircraft.json](http://adsb.30hours.dev/data/aircraft.json). The default data update rate is once per second. A timestamp is provided to match coordinates with a time.
- The bistatic range of each aircraft is computed using `distance_rx_to_target + distance_tx_to_target - distance_rx_to_rx`. The latitude, longitude and altitude is converted to [ECEF](https://en.wikipedia.org/wiki/Earth-centered,_Earth-fixed_coordinate_system) coordinates which means distances can be computed with a simple `norm`. 
- The bistatic Doppler by definition is the rate-of-change of the bistatic range. Unfortunately it's well known that [differentiation amplifies noise](https://dsp.stackexchange.com/questions/16540/derivative-of-noisy-signal) - as the bistatic range data has a small amount of noise, the Doppler values have even larger noise. We also require a causal solution (dependent only on previous values) which means we can't use a more accurate [Savitzky Golay filter](https://en.wikipedia.org/wiki/Savitzky%E2%80%93Golay_filter). The approach here is to use less accurate moving average filter to smooth the bistatic rangedata prior to differentation.
- Currently computing a smoothed derivative by finding the median on the last *k* samples of the bistatic range vector. This is by no means optimal - however it seems to work reasonably well and follow targets with *k=10*. Note this is causal and generally slightly lags the truth since we're using previous samples unweighted.
- Future work will be to try and extrapolate/guess future bistatic range values (assume a constant acceleration) and apply the Savitzky Golay filter - I will call this pseudo-causal since I'm guessing future samples. I expect this will be a more accurate source of truth.
- On second thoughts, may make more sense to run a Kalman filter smoother (which is inherently causal).

The system architecture is as follows:

- The first API call to a set of inputs will result in a blank response `{}`. This is fine - the first API call adds the set of inputs to the processing loop.
- This approach allows multiple sets of inputs to run simultaneously on the same server.
- Refresh and if there are moving aircraft in the server, the delay/Doppler coordinates will be computed.
- The API provides a JSON output in the format `{"<hex-code>":{"timestamp":<timestamp>,"flight":<flight-number>,"delay":<delay>,"doppler":<doppler>}}`.
- If no API calls are provided for a set of inputs after 10 minutes, that set will be dropped from the processing loop.

## Synthetic Detection Generation

The `/api/synthetic-detections` endpoint generates synthetic radar detections with configurable noise characteristics for testing and validation of passive radar tracking systems. This endpoint fetches live ADS-B data and converts it to realistic radar detections with measurement errors, missed detections, and false alarms.

### Key Features

- **Configurable Gaussian noise**: Add realistic measurement errors to delay and Doppler
- **Missed detections**: Simulate detection probability < 1.0
- **False alarms**: Generate Poisson-distributed clutter detections
- **Reproducible**: Seedable random number generation for repeatable tests
- **Extended format**: Outputs frame-based arrays compatible with [retina-tracker](https://github.com/30hours/retina-tracker)

### API Parameters

**Required Parameters:**
- `server`: tar1090 or adsb.lol server URL
- `rx`: Receiver coordinates as `lat,lon,alt` (decimal degrees, meters)
- `tx`: Transmitter coordinates as `lat,lon,alt` (decimal degrees, meters)
- `fc`: Transmitter frequency in MHz

**Optional Noise Parameters:**
- `noise_delay`: Delay noise standard deviation in km (default: 0.5)
- `noise_doppler`: Doppler noise standard deviation in Hz (default: 2.0)
- `snr_min`: Minimum SNR in dB (default: 8)
- `snr_max`: Maximum SNR in dB (default: 20)
- `detection_prob`: Detection probability 0-1 (default: 0.95)
- `false_alarm_rate`: False alarms per frame (default: 0.5)

**Optional Timing Parameters:**
- `frame_interval`: Frame interval in ms (default: 500)
- `duration`: Total duration in seconds (default: 10)

**Optional Range Parameters:**
- `delay_min`: Minimum delay for false alarms in km (default: 0)
- `delay_max`: Maximum delay for false alarms in km (default: 400)
- `doppler_min`: Minimum Doppler for false alarms in Hz (default: -200)
- `doppler_max`: Maximum Doppler for false alarms in Hz (default: 200)

**Optional Reproducibility:**
- `seed`: Random seed for reproducible results (default: current timestamp)

### Example Usage

**Basic usage with default noise:**
```
http://localhost:49155/api/synthetic-detections?server=http://adsb.30hours.dev&rx=51.5074,-0.1278,0&tx=51.5074,-0.0285,0&fc=204.64
```

**Custom noise parameters:**
```
http://localhost:49155/api/synthetic-detections?server=http://adsb.30hours.dev&rx=51.5074,-0.1278,0&tx=51.5074,-0.0285,0&fc=204.64&noise_delay=1.0&noise_doppler=5.0&detection_prob=0.8&false_alarm_rate=2.0
```

**Reproducible test with seed:**
```
http://localhost:49155/api/synthetic-detections?server=http://adsb.30hours.dev&rx=51.5074,-0.1278,0&tx=51.5074,-0.0285,0&fc=204.64&seed=test-42
```

### Output Format

The endpoint returns an array of detection frames in the extended `.detection` format compatible with retina-tracker:

```json
[
  {
    "timestamp": 1718747745000,
    "delay": [16.1, 22.3, 15.8],
    "doppler": [134.5, -50.2, 88.3],
    "snr": [15.2, 12.8, 18.5],
    "adsb": [
      {
        "hex": "a12345",
        "lat": 37.7749,
        "lon": -122.4194,
        "alt_baro": 5000,
        "gs": 250,
        "track": 45,
        "flight": "UAL123"
      },
      {
        "hex": "b67890",
        "lat": 37.8100,
        "lon": -122.3400,
        "alt_baro": 8500,
        "gs": 300,
        "track": 120,
        "flight": "DAL456"
      },
      null
    ]
  }
]
```

The `adsb` array is parallel to the `delay`, `doppler`, and `snr` arrays. Real aircraft detections include ADS-B metadata for ground truth comparison, while false alarms have `null` entries.

### Statistical Properties

The synthetic detections have the following statistical properties:

- **Delay noise**: Gaussian with mean 0 and standard deviation `noise_delay` km
- **Doppler noise**: Gaussian with mean 0 and standard deviation `noise_doppler` Hz
- **SNR**: Uniform distribution between `snr_min` and `snr_max` dB
- **Detection probability**: Bernoulli trial with probability `detection_prob` per aircraft per frame
- **False alarms**: Poisson-distributed count with rate `false_alarm_rate` per frame
- **False alarm positions**: Uniformly distributed in delay-Doppler space

## Mach 5 Anomalous Target Generation

For testing anomaly detection systems, adsb2dd can generate synthetic Mach 5 (~1715 m/s) target trajectories with realistic delay-Doppler characteristics.

### Usage

Generate Mach 5 target data using the provided script:

```bash
node generate_mach5_targets.js [options]
```

### Options

- `--rx LAT,LON,ALT`: Receiver position (default: 37.7644,-122.3954,23)
- `--tx LAT,LON,ALT`: Transmitter position (default: 37.49917,-121.87222,783)
- `--fc FREQUENCY`: Carrier frequency in MHz (default: 503)
- `--start LAT,LON,ALT`: Starting position for Mach 5 target (default: 37.5,-123.0,15000)
- `--heading DEGREES`: Direction of travel (default: 90, eastward)
- `--duration SECONDS`: Duration of trajectory (default: 60)
- `--timestep SECONDS`: Time between position samples (default: 0.5)
- `--output FILE`: Output .detection file (default: ./data/mach5_targets.detection)
- `--no-noise`: Disable synthetic noise (perfect measurements)

### Examples

**Generate default Mach 5 target:**
```bash
node generate_mach5_targets.js
```

**Custom trajectory heading north from San Francisco:**
```bash
node generate_mach5_targets.js --start 37.7,-122.4,15000 --heading 0 --duration 120
```

**Perfect measurements (no noise):**
```bash
node generate_mach5_targets.js --no-noise --output data/mach5_perfect.detection
```

### Output Format

The generated `.detection` file contains an array of frames compatible with [retina-tracker](https://github.com/30hours/retina-tracker):

```json
[
  {
    "timestamp": 1718747745000,
    "delay": [156.32],
    "doppler": [523.45],
    "snr": [15.2],
    "adsb": [
      {
        "hex": "MACH5X",
        "lat": 37.52,
        "lon": -122.95,
        "alt_baro": 49213,
        "gs": 3332,
        "track": 90,
        "flight": "MACH5"
      }
    ]
  }
]
```

### Technical Details

- **Speed**: Mach 5 at sea level (~1715 m/s or ~3332 knots)
- **Doppler shift**: Significantly higher than normal aircraft (typically >100 Hz)
- **Trajectory**: Great circle path with configurable heading
- **Noise**: Optional Gaussian noise on delay and Doppler measurements

This feature is designed to test anomaly detection in retina-tracker (see [retina-tracker#4](https://github.com/offworldlabs/retina-tracker/issues/4)).

## Future Work

- Add a 2D plot showing all aircraft in delay-Doppler space.
- Add a map showing aircraft in geographic space below the above plot.
- Investigate algorithms to accurately compute smooth Doppler values.

## License

[MIT](https://choosealicense.com/licenses/mit/)
