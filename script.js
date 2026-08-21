const searchForm   = document.getElementById('search-form');
const cityInput    = document.getElementById('city-input');

const statusMessage   = document.getElementById('status-message');
const currentWeatherEl = document.getElementById('current-weather');
const forecastEl       = document.getElementById('forecast');

const conditionIconEl = document.getElementById('condition-icon');
const tempEl          = document.getElementById('temp');
const locationEl      = document.getElementById('location');
const conditionTextEl = document.getElementById('condition-text');
const dateTextEl      = document.getElementById('date-text');
const feelsLikeEl     = document.getElementById('feels-like');
const humidityEl      = document.getElementById('humidity');
const windEl          = document.getElementById('wind');
const pressureEl      = document.getElementById('pressure');
const forecastStripEl = document.getElementById('forecast-strip');



searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const cityName = cityInput.value.trim();
  if (!cityName) return;

  await loadWeatherForCity(cityName);
});



document.addEventListener('DOMContentLoaded', loadAnalytics);

async function loadWeatherForCity(cityName) {
  showLoading(cityName);

  try {
    const response = await fetch(`/api/weather?city=${encodeURIComponent(cityName)}`);
    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Something went wrong.');
      return;
    }

    renderWeather(data.place, data.weather);
    loadAnalytics(); // Refresh analytics cards after every search

  } catch (err) {
    console.error(err);
    showError('Unable to connect to backend server.');
  }
}

async function loadAnalytics() {
  try {
    // 1. Fetch Top Searched
    const resTrending = await fetch('/api/analytics/trending');
    const trending = await resTrending.json();
    const topList = document.getElementById('top-cities-list');
    if (topList) {
      topList.innerHTML = trending.length 
        ? trending.map(item => `<li><span>${item.city}</span> <b>${item.searches}</b></li>`).join('')
        : '<li>No searches yet</li>';
    }

    // 2. Fetch User History
    const resHistory = await fetch('/api/analytics/user-history');
    const history = await resHistory.json();
    const historyList = document.getElementById('user-history-list');
    if (historyList) {
      historyList.innerHTML = history.length
        ? history.map(item => `<li><span>${item.city}</span> <small>${item.time}</small></li>`).join('')
        : '<li>No history</li>';
    }

    // 3. Fetch Highlights
    const resHighlights = await fetch('/api/analytics/national-highlights');
    const highlights = await resHighlights.json();
    
    const tempEl = document.getElementById('best-temp-city');
    const aqiEl = document.getElementById('best-aqi-city');
    
    if (tempEl) tempEl.textContent = `${highlights.best_weather.city} (${highlights.best_weather.temp})`;
    if (aqiEl) aqiEl.textContent = `${highlights.best_aqi.city} (AQI: ${highlights.best_aqi.aqi})`;

  } catch (err) {
    console.error('Failed loading analytics:', err);
  }
}
// Turns a city name into { latitude, longitude, name, country }
async function geocodeCity(cityName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding API returned ${response.status}`);
  }

  const data = await response.json();

  // If no city matched, Open-Meteo returns no "results" key at all.
  if (!data.results || data.results.length === 0) {
    return null;
  }

  const result = data.results[0];
  return {
    name: result.name,
    country: result.country,
    admin1: result.admin1, // state/region, e.g. "Tamil Nadu"
    latitude: result.latitude,
    longitude: result.longitude,
  };
}


// Fetches current weather + 5-day forecast for a coordinate.
async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: 6, // today + next 5
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Forecast API returned ${response.status}`);
  }

  return response.json();
}


// ---- 5. Rendering results to the page ------------------------

function renderWeather(place, weather) {
  const current = weather.current;
  const info = getWeatherInfo(current.weather_code, current.is_day);

  
  document.body.className = current.is_day ? info.bodyClass : 'weather-night';

  conditionIconEl.textContent = info.icon;
  tempEl.textContent = `${Math.round(current.temperature_2m)}°`;
  locationEl.textContent = place.admin1
    ? `${place.name}, ${place.admin1}`
    : `${place.name}, ${place.country}`;
  conditionTextEl.textContent = info.label;
  dateTextEl.textContent = formatDate(current.time);

  feelsLikeEl.textContent = `${Math.round(current.apparent_temperature)}°`;
  humidityEl.textContent = `${current.relative_humidity_2m}%`;
  windEl.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  pressureEl.textContent = `${Math.round(current.surface_pressure)} hPa`;

  renderForecast(weather.daily);

  statusMessage.classList.add('hidden');
  currentWeatherEl.classList.remove('hidden');
  forecastEl.classList.remove('hidden');
}


function renderForecast(daily) {
  forecastStripEl.innerHTML = ''; // clear any previous forecast

  // daily.time[0] is today, so we start from index 1 for
  // "the next 5 days" and stop before index 6.
  for (let i = 1; i < 6; i++) {
    const info = getWeatherInfo(daily.weather_code[i], true);
    const dayName = new Date(daily.time[i]).toLocaleDateString('en-US', { weekday: 'short' });
    const high = Math.round(daily.temperature_2m_max[i]);
    const low = Math.round(daily.temperature_2m_min[i]);

    const dayCard = document.createElement('div');
    dayCard.className = 'forecast-day';
    dayCard.innerHTML = `
      <div class="forecast-day-name">${dayName}</div>
      <div class="forecast-day-icon">${info.icon}</div>
      <div class="forecast-day-temps">${high}° <span class="low">${low}°</span></div>
    `;
    forecastStripEl.appendChild(dayCard);
  }
}


// ---- Helper: WMO weather code -> icon / label / theme --------
// Open-Meteo uses the international "WMO weather code" standard
// instead of plain English, so we translate it ourselves.
// Reference: https://open-meteo.com/en/docs (WMO Weather codes)
function getWeatherInfo(code, isDay) {
  const map = {
    0:  { label: 'Clear sky',        icon: isDay ? '☀️' : '🌙', bodyClass: 'weather-clear' },
    1:  { label: 'Mainly clear',     icon: isDay ? '🌤️' : '🌙', bodyClass: 'weather-clear' },
    2:  { label: 'Partly cloudy',    icon: '⛅',                bodyClass: 'weather-cloudy' },
    3:  { label: 'Overcast',         icon: '☁️',                bodyClass: 'weather-cloudy' },
    45: { label: 'Fog',              icon: '🌫️',               bodyClass: 'weather-fog' },
    48: { label: 'Depositing fog',   icon: '🌫️',               bodyClass: 'weather-fog' },
    51: { label: 'Light drizzle',    icon: '🌦️',               bodyClass: 'weather-rain' },
    53: { label: 'Drizzle',          icon: '🌦️',               bodyClass: 'weather-rain' },
    55: { label: 'Dense drizzle',    icon: '🌧️',               bodyClass: 'weather-rain' },
    61: { label: 'Light rain',       icon: '🌦️',               bodyClass: 'weather-rain' },
    63: { label: 'Rain',             icon: '🌧️',               bodyClass: 'weather-rain' },
    65: { label: 'Heavy rain',       icon: '🌧️',               bodyClass: 'weather-rain' },
    71: { label: 'Light snow',       icon: '🌨️',               bodyClass: 'weather-snow' },
    73: { label: 'Snow',             icon: '❄️',                bodyClass: 'weather-snow' },
    75: { label: 'Heavy snow',       icon: '❄️',                bodyClass: 'weather-snow' },
    80: { label: 'Rain showers',     icon: '🌦️',               bodyClass: 'weather-rain' },
    81: { label: 'Rain showers',     icon: '🌧️',               bodyClass: 'weather-rain' },
    82: { label: 'Violent showers',  icon: '🌧️',               bodyClass: 'weather-rain' },
    95: { label: 'Thunderstorm',     icon: '⛈️',               bodyClass: 'weather-thunder' },
    96: { label: 'Thunder + hail',   icon: '⛈️',               bodyClass: 'weather-thunder' },
    99: { label: 'Thunder + hail',   icon: '⛈️',               bodyClass: 'weather-thunder' },
  };

  // Fallback in case a code isn't in our table — keeps the
  // app from breaking if the API ever adds a new code.
  return map[code] || { label: 'Unknown', icon: '🌡️', bodyClass: 'weather-default' };
}


// ---- Small helpers --------------------------------------------

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

function showLoading(cityName) {
  statusMessage.classList.remove('hidden', 'error');
  statusMessage.innerHTML = `<p>Loading weather for "${cityName}"…</p>`;
  currentWeatherEl.classList.add('hidden');
  forecastEl.classList.add('hidden');
}

function showError(message) {
  statusMessage.classList.remove('hidden');
  statusMessage.classList.add('error');
  statusMessage.innerHTML = `<p>${message}</p>`;
  currentWeatherEl.classList.add('hidden');
  forecastEl.classList.add('hidden');
}