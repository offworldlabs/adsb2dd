const MAX_ADSB_LOL_RADIUS = 250;

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;

    const response = await fetch(apiUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }

    const data = await response.json();
    if (data && typeof data.now === 'number' && !isNaN(data.now)) {
      return true;
    } else {
      console.error('Invalid or missing timestamp in the "now" key.');
      return false;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Request timeout checking adsb.lol API');
    } else {
      console.error('Error checking adsb.lol:', error.message);
    }
    return false;
  } finally {
    clearTimeout(timeout);
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;

    const response = await fetch(apiUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }

    const data = await response.json();

    // adsb.lol API returns timestamp in milliseconds
    // convert to seconds to match tar1090 format
    // use simple heuristic: if > 1e12, treat as milliseconds
    const timestamp = data.now;
    const nowInSeconds = timestamp > 1e12 ? timestamp / 1000 : timestamp;

    // validate result is within reasonable range (±1 year)
    const currentTime = Date.now() / 1000;
    const oneYear = 365 * 24 * 60 * 60;
    if (Math.abs(nowInSeconds - currentTime) > oneYear) {
      throw new Error(`Timestamp out of reasonable range: ${timestamp}`);
    }

    return {
      now: nowInSeconds,
      messages: data.total || 0,
      aircraft: data.ac || []
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Request timeout fetching adsb.lol data');
    } else {
      console.error('Error fetching adsb.lol:', error.message);
    }
    return {
      now: Date.now() / 1000,
      messages: 0,
      aircraft: []
    };
  } finally {
    clearTimeout(timeout);
  }
}
