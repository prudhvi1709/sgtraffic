# Singapore Traffic Analysis Dashboard

A comprehensive web-based dashboard for analyzing traffic patterns in Singapore using traffic camera data. The dashboard provides real-time insights, visualizations, and AI-powered analysis of traffic conditions.

## Features

### 🚦 Traffic Monitoring
- Real-time traffic volume analysis
- Congestion level detection
- Vehicle counting using AI (COCO-SSD model)
- Interactive traffic map with camera locations

### 📊 Data Visualization
- Traffic volume trends over time
- Hourly traffic patterns
- Congestion level distribution
- Top cameras by traffic volume
- Interactive charts and graphs

### 🤖 AI-Powered Analysis
- Automated vehicle detection
- Congestion level classification
- Traffic pattern insights generation
- Anomaly detection
- Model comparison (COCO-SSD vs. Gemini)

### 🔍 Advanced Filtering
- Filter by hour of day
- Filter by congestion level
- Filter by camera ID
- Filter by date
- Real-time data updates

### 📈 Insights Generation
- Daily traffic summaries
- Peak hour analysis
- Camera-specific insights
- Traffic pattern anomalies
- AI-generated traffic reports

## Technologies Used

- **Frontend**:
  - HTML5, CSS3, JavaScript
  - Bootstrap 5.3.2
  - Chart.js 4.4.0
  - Leaflet.js (for maps)
  - Font Awesome 6.4.2

- **AI/ML**:
  - TensorFlow.js (COCO-SSD model)
  - Gemini 2.0 Flash API
  - Pyodide (Python in browser)

- **Data Processing**:
  - Python 3.9+
  - Pandas
  - NumPy

## Getting Started

### Prerequisites
- Python 3.9 or higher
- Modern web browser (Chrome, Firefox, Safari)
- Internet connection (for loading external libraries and APIs)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/prudhvi1709/sgtraffic.git
cd sgtraffic
```

2. Set up the data directory:
```bash
mkdir traffic_images
```

3. Run the data collection script:
```bash
uv run scrape.py
```

4. Process the images:
```bash
uv run  parse_traffic_images.py
```

### Running the Dashboard

1. Start a local web server:
```bash
python -m http.server 8000
```

2. Open your browser and navigate to:
```
http://localhost:8000/
```

## Data Collection

The system collects traffic camera images from Singapore's traffic monitoring system. The collection process includes:

1. Automated image scraping at regular intervals
2. Metadata extraction and organization
3. AI-powered vehicle detection and analysis
4. Data aggregation and storage

## Usage

1. **Load Data**: Click the "Load CSV" button to import your traffic data
2. **Analyze Images**: Use the "Analyze All Images" button for batch processing
3. **Filter Data**: Apply filters to focus on specific time periods or locations
4. **View Insights**: Navigate through different tabs for various analyses
5. **Export Reports**: Download generated insights and statistics

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Singapore Land Transport Authority for traffic data
- TensorFlow.js team for COCO-SSD model
- Gemini API team for AI capabilities
- Contributors and maintainers

