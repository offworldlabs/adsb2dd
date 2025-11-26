import fetch from 'node-fetch';

/// @brief Check that the tar1090 server is valid and active.
/// @param apiUrl Full path to aircraft.json.
/// @return True if tar1090 server is valid.
export async function checkTar1090(apiUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
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
      console.error('Request timeout checking tar1090 server');
    } else {
      console.error('Error checking tar1090:', error.message);
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/// @brief Get JSON response from tar1090 server.
/// @param apiUrl Full path to aircraft.json.
/// @return JSON response.
export async function getTar1090(apiUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(apiUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Request timeout fetching tar1090 data');
    } else {
      console.error('Error fetching tar1090:', error.message);
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

