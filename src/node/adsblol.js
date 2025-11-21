import fetch from 'node-fetch';

// constants
const MAX_ADSB_LOL_RADIUS = 250; // nautical miles, adsb.lol API limit

/// @brief Validate lat/lon/radius parameters
/// @param lat Latitude
/// @param lon Longitude
/// @param radius Radius in nautical miles
/// @return True if all parameters are valid
function validateParameters(lat, lon, radius) {
  if (typeof lat !== 'number' || lat < -90 || lat > 90) {
    console.error('Invalid latitude:', lat);
    return false;
  }
  if (typeof lon !== 'number' || lon < -180 || lon > 180) {
    console.error('Invalid longitude:', lon);
    return false;
  }
  if (typeof radius !== 'number' || radius <= 0 || radius > MAX_ADSB_LOL_RADIUS) {
    console.error('Invalid radius:', radius);
    return false;
  }
  return true;
}

/// @brief Check that the adsb.lol API is valid and active.
/// @param lat Latitude of query center.
/// @param lon Longitude of query center.
/// @param radius Radius in nautical miles (max 250).
/// @return True if adsb.lol API is valid.
export async function checkAdsbLol(lat, lon, radius) {
  if (!validateParameters(lat, lon, radius)) {
    return false;
  }

  try {
    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;

    // add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }

    const data = await response.json();
    if (data && typeof data.now === 'number' && !isNaN(data.now)) {
      return true;
    } else {
      console.log('Invalid or missing timestamp in the "now" key.');
      return false;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

/// @brief Get JSON response from adsb.lol API and normalize to tar1090 format.
/// @param lat Latitude of query center.
/// @param lon Longitude of query center.
/// @param radius Radius in nautical miles (max 250).
/// @return Normalized JSON response matching tar1090 format.
export async function getAdsbLol(lat, lon, radius) {
  if (!validateParameters(lat, lon, radius)) {
    return { now: Date.now() / 1000, messages: 0, aircraft: [] };
  }

  try {
    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;

    // add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }

    const data = await response.json();

    // adsb.lol API returns timestamp in milliseconds (verified: values > 1e12)
    // convert to seconds to match tar1090 format
    // if timestamp appears to already be in seconds, use as-is
    const timestamp = data.now;
    const nowInSeconds = timestamp > 1e12 ? timestamp / 1000 : timestamp;

    return {
      now: nowInSeconds,
      messages: data.total || 0,
      aircraft: data.ac || []
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      now: Date.now() / 1000,
      messages: 0,
      aircraft: []
    };
  }
}
