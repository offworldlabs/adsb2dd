# Sign Convention Fix Analysis

## Problem Summary

After implementing velocity-based Doppler calculations, testing revealed that the velocity-based and position-based methods produced values with **opposite signs** and similar magnitudes (~44 Hz difference).

## Root Cause

The bug was in the **range rate calculation** in the velocity-based method. The issue stemmed from incorrect interpretation of the dot product result.

### Vector Definition

In `calculateDopplerFromVelocity()`, unit vectors were defined as:

```javascript
const vec_to_rx = {
  x: (ecefRx.x - aircraft_ecef.x) / dRxTar,  // Points FROM aircraft TO RX
  ...
};
```

### The Bug

The original code computed range rates as:

```javascript
const range_rate_rx = vel_ecef.x * vec_to_rx.x +
                      vel_ecef.y * vec_to_rx.y +
                      vel_ecef.z * vec_to_rx.z;
```

**Problem**: When aircraft velocity has a positive component along `vec_to_rx` (pointing FROM aircraft TO RX), it means the aircraft is moving **TOWARD** the RX, which means distance is **DECREASING**. However, a positive dot product was being interpreted as positive range rate (increasing distance), which is backwards!

### The Fix

Negate the dot products to correctly interpret the sign:

```javascript
const range_rate_rx = -(vel_ecef.x * vec_to_rx.x +
                        vel_ecef.y * vec_to_rx.y +
                        vel_ecef.z * vec_to_rx.z);
```

**Reasoning**:
- Positive dot product → aircraft moving toward rx/tx → distance decreasing → range rate is NEGATIVE
- Negative dot product → aircraft moving away from rx/tx → distance increasing → range rate is POSITIVE

## Verification

### Test Case

Aircraft at -34.95°, 138.65°, flying NE (45°) at 100 knots:
- RX at -34.9192°, 138.6027° (SW of aircraft)
- TX at -34.9810°, 138.7081° (SE of aircraft)

**Before Fix**:
- Velocity-based: -2.28 Hz
- Position-based: +2.11 Hz
- **Sign mismatch** ✗

**After Fix**:
- Velocity-based: +2.28 Hz
- Position-based: +2.11 Hz
- **Signs match** ✓
- Difference: 0.16 Hz (<10% error)

### Live Testing with synthetic-adsb

After fix, consecutive samples show agreement:

```
Sample 1: doppler_vel: 23.80 Hz, doppler_pos: 11.86 Hz
Sample 2: doppler_vel: 24.26 Hz, doppler_pos: 23.79 Hz
Sample 3: doppler_vel: 24.69 Hz, doppler_pos: 24.03 Hz
Sample 4: doppler_vel: 25.13 Hz, doppler_pos: 24.27 Hz
```

**Observations**:
- Both methods show positive Doppler (same sign) ✓
- Values converge as position-based accumulates samples
- Position-based lags slightly due to smoothing
- Agreement within ~1 Hz after convergence

## Physics Validation

For the test geometry (aircraft moving NE from between RX and TX):
- Range to RX: **increasing** → positive Doppler from RX contribution
- Range to TX: **decreasing** → negative Doppler from TX contribution
- Net bistatic: depends on which effect dominates

The position-based method measured actual delay decrease of -3.10 m/s, confirming the velocity-based calculation is now correct.

## Impact

This fix ensures:
1. **Physical correctness**: Range rates have correct sign convention
2. **Method agreement**: Velocity and position methods now produce consistent results
3. **Issue resolution**: Addresses the original GitHub Issue #1 completely

## Files Modified

- `src/server.js`: Fixed range rate calculations (lines 83-89)
- `src/test_velocity_doppler.js`: Applied same fix to unit tests (lines 44-50)
- All 5 unit tests continue to pass

## Conclusion

The sign error was a subtle but critical bug in the velocity-based Doppler implementation. The fix involves negating the dot products to correctly interpret the geometric relationship between aircraft velocity and line-of-sight vectors. After the fix, both methods produce physically correct and mutually consistent results.
