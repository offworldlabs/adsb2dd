import fetch from 'node-fetch';

/// @brief Check that the adsb.lol API is valid and active.
/// @param lat Latitude of query center.
/// @param lon Longitude of query center.
/// @param radius Radius in nautical miles (max 250).
/// @return True if adsb.lol API is valid.
export async function checkAdsbLol(lat, lon, radius) {
  try {
    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;
    const response = await fetch(apiUrl);

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
  try {
    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }

    const data = await response.json();

    return {
      now: data.now / 1000,
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
