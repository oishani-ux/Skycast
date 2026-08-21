import os
import requests
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func

app = Flask(__name__)
CORS(app)

# --- Database Setup (Supabase) ---
from sqlalchemy.pool import NullPool
import os

db_url = os.environ.get('DATABASE_URL', 'sqlite:///weather.db')
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

if 'sqlite' not in db_url:
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"poolclass": NullPool}
db = SQLAlchemy(app)

# Database Table 1: Log every search
class SearchLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    city_name = db.Column(db.String(100), nullable=False)
    country = db.Column(db.String(100))
    user_ip = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# Database Table 2: Cache city metadata and coordinates
class CityCache(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    city_name = db.Column(db.String(100), unique=True, nullable=False)
    country = db.Column(db.String(100))
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)

with app.app_context():
    db.create_all()

# Preset major national hubs to scan for "Best Weather" and "Best AQI"
HUB_CITIES = ["Delhi", "Mumbai", "Bengaluru", "Chennai", "Kolkata", "Hyderabad", "Shimla"]

# --- Routes ---

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/weather', methods=['GET'])
def get_weather():
    city_name = request.args.get('city')
    if not city_name:
        return jsonify({'error': 'City name is required'}), 400

    user_ip = request.remote_addr

    try:
        # Step A: Check local cache first, otherwise fetch geocoding
        cached_city = CityCache.query.filter(func.lower(CityCache.city_name) == city_name.lower()).first()
        
        if cached_city:
            lat, lon = cached_city.lat, cached_city.lon
            official_name = cached_city.city_name
            country = cached_city.country
        else:
            geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={city_name}&count=1&language=en&format=json"
            geo_res = requests.get(geo_url).json()

            if not geo_res.get('results'):
                return jsonify({'error': f"Couldn't find '{city_name}'"}), 404

            location = geo_res['results'][0]
            lat, lon = location['latitude'], location['longitude']
            official_name = location['name']
            country = location.get('country', '')

            # Save to cache
            new_cache = CityCache(city_name=official_name, country=country, lat=lat, lon=lon)
            db.session.add(new_cache)
            db.session.commit()

        # Step B: Log search query to database
        log_entry = SearchLog(city_name=official_name, country=country, user_ip=user_ip)
        db.session.add(log_entry)
        db.session.commit()

        # Step C: Fetch Weather + AQI
        weather_url = "https://api.open-meteo.com/v1/forecast"
        params = {
            'latitude': lat,
            'longitude': lon,
            'current': 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,is_day',
            'daily': 'weather_code,temperature_2m_max,temperature_2m_min',
            'timezone': 'auto',
            'forecast_days': 6
        }
        weather_res = requests.get(weather_url, params=params).json()

        # Fetch AQI
        aqi_url = f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&current=us_aqi"
        aqi_res = requests.get(aqi_url).json()
        us_aqi = aqi_res.get('current', {}).get('us_aqi', None)

        return jsonify({
            'place': {'name': official_name, 'country': country},
            'weather': weather_res,
            'aqi': us_aqi
        })

    except Exception as e:
        print(e)
        return jsonify({'error': 'Failed to fetch weather data'}), 500

# --- Analytics Endpoints ---

@app.route('/api/analytics/trending', methods=['GET'])
def get_trending():
    # Returns top 5 searched cities
    top_cities = db.session.query(
        SearchLog.city_name, func.count(SearchLog.id).label('count')
    ).group_by(SearchLog.city_name).order_by(db.desc('count')).limit(5).all()

    return jsonify([{'city': c[0], 'searches': c[1]} for c in top_cities])

@app.route('/api/analytics/user-history', methods=['GET'])
def get_user_history():
    # Returns last 5 searches made by current IP
    user_ip = request.remote_addr
    history = SearchLog.query.filter_by(user_ip=user_ip)\
        .order_by(SearchLog.timestamp.desc()).limit(5).all()
    
    return jsonify([{'city': h.city_name, 'time': h.timestamp.strftime('%H:%M')} for h in history])

@app.route('/api/analytics/national-highlights', methods=['GET'])
def get_national_highlights():
    # Checks preset cities to find best weather (closest to 22°C) and best AQI (lowest)
    best_weather = {"city": "N/A", "temp": None, "score": float('inf')}
    best_aqi = {"city": "N/A", "aqi": float('inf')}

    for city in HUB_CITIES:
        try:
            # Quick lookup/geocoding
            cache = CityCache.query.filter_by(city_name=city).first()
            if cache:
                lat, lon = cache.lat, cache.lon
            else:
                geo = requests.get(f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1").json()
                if not geo.get('results'): continue
                lat, lon = geo['results'][0]['latitude'], geo['results'][0]['longitude']
            
            # Fetch Weather & AQI together
            w_res = requests.get(f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m").json()
            a_res = requests.get(f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&current=us_aqi").json()

            temp = w_res.get('current', {}).get('temperature_2m')
            aqi = a_res.get('current', {}).get('us_aqi')

            if temp is not None:
                # Ideal weather heuristic: closest to 22°C room temperature
                diff = abs(temp - 22.0)
                if diff < best_weather["score"]:
                    best_weather = {"city": city, "temp": temp, "score": diff}

            if aqi is not None and aqi < best_aqi["aqi"]:
                best_aqi = {"city": city, "aqi": aqi}

        except Exception:
            continue

    return jsonify({
        'best_weather': {'city': best_weather['city'], 'temp': f"{best_weather['temp']}°C" if best_weather['temp'] else "N/A"},
        'best_aqi': {'city': best_aqi['city'], 'aqi': best_aqi['aqi'] if best_aqi['aqi'] != float('inf') else "N/A"}
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)