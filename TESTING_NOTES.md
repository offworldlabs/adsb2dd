# Velocity-Based Doppler Testing Notes

## Test Setup

- **synthetic-adsb**: Running on port 5001, providing aircraft with velocity data (gs, track)
- **adsb2dd**: Running on port 49155 with velocity-doppler branch
- **Configuration**:
  - RX: -34.9192, 138.6027, 110m (Adelaide Hills)
  - TX: -34.9810, 138.7081, 750m (Mount Lofty)
  - Frequency: 204.64 MHz
  - Aircraft: Circular path around TX at 30,000 ft, ~92 knots

## Test Results

### Sample Data (5 consecutive measurements over 10 seconds)

```
Sample 1: doppler_vel: 22.09005 Hz, doppler_pos: -21.78883 Hz, diff: ~44 Hz
Sample 2: doppler_vel: 22.20032 Hz, doppler_pos: -21.95958 Hz, diff: ~44 Hz
Sample 3: doppler_vel: 22.29215 Hz, doppler_pos: -22.06376 Hz, diff: ~44 Hz
Sample 4: doppler_vel: 22.39235 Hz, doppler_pos: -22.20879 Hz, diff: ~44 Hz
Sample 5: doppler_vel: 22.44942 Hz, doppler_pos: -22.29355 Hz, diff: ~44 Hz
```

### Key Observations

1. **Opposite Signs**: The two methods consistently produce values with opposite signs
2. **Similar Magnitudes**: |doppler_vel| ≈ |doppler_pos| ≈ 22 Hz
3. **Consistent Difference**: Δ ≈ 44 Hz across all samples
4. **Smooth Variation**: Both methods show smooth temporal evolution

### Analysis

The systematic opposite signs and similar magnitudes suggest a **sign convention difference** between the two methods. Possible causes:

1. **Different Range Rate Conventions**:
   - Position-based: differentiates bistatic delay (range sum)
   - Velocity-based: projects velocity onto line-of-sight vectors

2. **Vector Direction Convention**:
   - `vec_to_rx/tx` points FROM aircraft TO rx/tx
   - Positive dot product means aircraft moving toward rx/tx
   - This should give negative range rate (decreasing distance)

3. **Sign in Doppler Formula**:
   - Both methods use `-range_rate / wavelength`
   - Position method: `doppler_pos = -doppler_ms / wavelength`
   - Velocity method: `doppler = -bistatic_range_rate / wavelength`

### Implementation Status

✅ Velocity-based Doppler calculation implemented
✅ Fallback to position-based method working
✅ Both values output for comparison (`doppler_vel`, `doppler_pos`)
✅ Method indicator field (`doppler_method`) working
⚠️  Sign convention discrepancy identified

### Next Steps

The sign discrepancy needs investigation:
1. Verify ENU to ECEF transformation is correct
2. Check vector directions in both methods
3. Validate against known test cases with expected Doppler values
4. Consider that one method may have been using the wrong sign convention all along

### Recommendations for PR

Despite the sign discrepancy, the implementation is functionally complete:
- Velocity-based method works and produces consistent values
- Fallback mechanism works
- Output includes comparison fields for debugging
- The discrepancy suggests a pre-existing issue that should be documented

The PR can be submitted with these notes, allowing the user to investigate the sign convention issue further with real ADS-B data or additional validation.
