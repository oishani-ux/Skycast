# Skycast — Full-Stack Weather & Analytics Dashboard

Skycast is a responsive, full-stack weather application that delivers real-time weather forecasts, air quality metrics, and search analytics. Designed with a dynamic user interface, the application automatically adapts its visual theme based on current meteorological conditions.

## Key Features
* **Real-Time Data Integration:** Retrieves live temperature, humidity, wind speed, and Air Quality Index (AQI) via the Open-Meteo API.
* **Dynamic Environment Theming:** The user interface programmatically shifts color palettes and backgrounds to reflect real-time weather conditions.
* **Analytics & Tracking:** Features a built-in analytics engine powered by SQLite that tracks trending searches, logs user search history, and calculates optimal national weather conditions (e.g., "Best Temp," "Cleanest Air").
* **Responsive Layout:** Engineered with a mobile-first approach, utilizing modern CSS Grid and Flexbox for seamless scaling across desktop and mobile devices.

## Technical Architecture
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **Backend:** Python, Flask, Flask-SQLAlchemy, Flask-CORS
* **Database:** SQLite
* **External APIs:** Open-Meteo (Geocoding, Weather Forecast, and Air Quality)

##  Installation & Setup

To run this project locally, follow these steps:

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/oishani-ux/Skycast.git](https://github.com/oishani-ux/Skycast.git)
   cd Skycast



1.Install dependencies:
Ensure you have Python installed on your system, then run:
  
pip install Flask requests flask-cors Flask-SQLAlchemy


2.Initialize the application:
  
  python app.py

3.Access the web interface:

 Open your preferred browser and navigate to http://127.0.0.1:5000.


## Technical Learnings
  -Developing Skycast provided hands-on experience with:

  -Designing and querying relational databases using an ORM (SQLAlchemy).

  -Managing state and DOM manipulation in Vanilla JavaScript without relying on external frontend frameworks.

  -Handling asynchronous API calls and implementing robust error handling for third-party integrations.