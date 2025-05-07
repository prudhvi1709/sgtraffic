// Global variables
let pyodide = null;
let trafficData = null;
let filteredData = null;
let currentPage = 1;
const itemsPerPage = 9;
let imageBasePath = 'traffic_images_parallel/';

// Bootstrap modal, vehicle detection model, charts, map
let imageModal = null, cocoSsdModel = null, isModelLoading = false;
let trafficVolumeChart = null, congestionChart = null, hourlyTrafficChart = null, topCamerasChart = null;
let trafficMap = null, markers = [];
// Gemini endpoint for comparison
const GEMINI_ENDPOINT = 'https://llmfoundry.straive.com/gemini/v1beta/models/gemini-2.0-flash:generateContent';

// Singapore map coordinates
const SINGAPORE_COORDS = {
    center: [1.3521, 103.8198],
    cameras: {}  // Will be populated with camera coordinates
};

// Sample camera locations
const SAMPLE_CAMERA_LOCATIONS = {
    "1001": [1.3099, 103.7775], "1002": [1.3246, 103.8120], "1003": [1.3404, 103.8395],
    "1004": [1.2958, 103.8531], "1005": [1.3327, 103.8546], "1006": [1.3099, 103.8859],
    "1007": [1.3234, 103.9154], "1008": [1.3497, 103.9717], "1009": [1.3765, 103.9489],
    "1010": [1.4043, 103.9013], "1011": [1.3868, 103.8480], "1012": [1.3813, 103.7652],
    "1013": [1.4387, 103.7868], "1014": [1.3644, 103.7667], "1015": [1.3428, 103.7046]
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize modal
    imageModal = new bootstrap.Modal(document.getElementById('imageDetailModal'));
    
    // Set up event listeners
    document.getElementById('loadDataBtn').addEventListener('click', () => document.getElementById('csvFileInput').click());
    document.getElementById('csvFileInput').addEventListener('change', handleFileUpload);
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
    document.getElementById('dateFilter').addEventListener('change', generateDailySummary);
    
    // Vehicle detection 
    document.getElementById('detectVehiclesBtn').addEventListener('click', detectVehiclesInCurrentImage);
    document.getElementById('analyzeImageBtn').addEventListener('click', analyzeCurrentImage);
    document.getElementById('compareModelsBtn').addEventListener('click', compareDetectionModels);
    document.getElementById('analyzeAllBtn').addEventListener('click', analyzeAllImages);
    document.getElementById('detectAnomaliesBtn').addEventListener('click', detectAnomalies);
    
    // Initialize Pyodide and COCO-SSD model in the background
    initPyodide();
    loadCocoSsdModel();
    
    // Initialize empty charts
    initCharts();
});

// Initialize charts with empty data
function initCharts() {
    // Traffic Volume Chart (line chart)
    const trafficVolumeCtx = document.getElementById('trafficVolumeChart').getContext('2d');
    trafficVolumeChart = new Chart(trafficVolumeCtx, {
        type: 'line',
        data: {
            labels: ['Loading...'],
            datasets: [{
                label: 'Average Vehicle Count',
                data: [0],
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: 'Traffic Volume Over Time' } }
        }
    });
    
    // Congestion Chart (pie chart)
    const congestionCtx = document.getElementById('congestionChart').getContext('2d');
    congestionChart = new Chart(congestionCtx, {
        type: 'pie',
        data: {
            labels: ['Low', 'Medium', 'High'],
            datasets: [{
                data: [1, 0, 0],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(255, 99, 132, 0.7)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: 'Congestion Level Distribution' } }
        }
    });
    
    // Hourly Traffic Chart (bar chart)
    const hourlyTrafficCtx = document.getElementById('hourlyTrafficChart').getContext('2d');
    hourlyTrafficChart = new Chart(hourlyTrafficCtx, {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [{
                label: 'Average Vehicles',
                data: Array(24).fill(0),
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: 'Average Traffic by Hour of Day' } },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Average Vehicle Count' }},
                x: { title: { display: true, text: 'Hour of Day' }}
            }
        }
    });
    
    // Top Cameras Chart (horizontal bar chart)
    const topCamerasCtx = document.getElementById('topCamerasChart').getContext('2d');
    topCamerasChart = new Chart(topCamerasCtx, {
        type: 'bar',
        data: {
            labels: ['Loading...'],
            datasets: [{
                label: 'Average Vehicle Count',
                data: [0],
                backgroundColor: 'rgba(153, 102, 255, 0.7)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { title: { display: true, text: 'Top Cameras by Traffic Volume' } },
            scales: {
                x: { beginAtZero: true, title: { display: true, text: 'Average Vehicle Count' }}
            }
        }
    });
}

// Load COCO-SSD model
async function loadCocoSsdModel() {
    if (cocoSsdModel || isModelLoading) return;
    
    try {
        isModelLoading = true;
        console.log("Loading COCO-SSD model...");
        cocoSsdModel = await cocoSsd.load();
        console.log("COCO-SSD model loaded successfully");
        document.getElementById('vehicleDetectionPanel').classList.remove('d-none');
        isModelLoading = false;
    } catch (error) {
        console.error("Error loading COCO-SSD model:", error);
        isModelLoading = false;
    }
}

// Initialize Pyodide
async function initPyodide() {
    try {
        pyodide = await loadPyodide();
        console.log("Pyodide loaded successfully");
        await pyodide.loadPackagesFromImports('import pandas as pd');
        console.log("Pandas loaded successfully");
    } catch (error) {
        console.error("Error loading Pyodide:", error);
        alert("Failed to load Pyodide. Please check console for details.");
    }
}

// Detect vehicles in an image
async function detectVehicles(imageElement) {
    // Validate image and load model if needed
    if (!imageElement || !imageElement.complete || imageElement.naturalWidth === 0) {
        console.error("Invalid image for vehicle detection");
        return { vehicleCount: 0, congestionLevel: 'low', detections: [] };
    }
    
    if (!cocoSsdModel) {
        try {
            cocoSsdModel = await cocoSsd.load();
        } catch (error) {
            console.error("Error loading model:", error);
            return { vehicleCount: 0, congestionLevel: 'low', detections: [] };
        }
    }
    
    try {
        // Create canvas for processing
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = imageElement.naturalWidth;
        tempCanvas.height = imageElement.naturalHeight;
        tempCtx.drawImage(imageElement, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Detect vehicles
        const predictions = await cocoSsdModel.detect(tempCanvas);
        const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'];
        const vehicles = predictions.filter(p => vehicleClasses.includes(p.class));
        const vehicleCount = vehicles.length;
        
        // Determine congestion level
        let congestionLevel = 'low';
        if (vehicleCount >= 10) congestionLevel = 'high';
        else if (vehicleCount >= 5) congestionLevel = 'medium';
        
        return { vehicleCount, congestionLevel, detections: vehicles };
    } catch (error) {
        console.error("Error detecting vehicles:", error);
        return { vehicleCount: 0, congestionLevel: 'low', detections: [] };
    }
}

// Process detection results
function processDetectionResults(detections, ctx) {
    // Update UI with vehicle counts
    let vehicleCount = detections.length;
    let congestionLevel = 'low';
    if (vehicleCount >= 10) congestionLevel = 'high';
    else if (vehicleCount >= 5) congestionLevel = 'medium';
    
    // Update the modal information
    document.getElementById('modalVehicles').textContent = vehicleCount;
    document.getElementById('vehicleSource').textContent = "(detected)";
    document.getElementById('modalCongestion').textContent = congestionLevel.charAt(0).toUpperCase() + congestionLevel.slice(1);
    document.getElementById('congestionSource').textContent = "(detected)";
    
    // Draw detection boxes if context provided
    if (ctx && detections.length > 0) drawDetections(ctx, detections);
    
    return { vehicleCount, congestionLevel };
}

// Detect vehicles in current image
async function detectVehiclesInCurrentImage() {
    const modalImage = document.getElementById('modalImage');
    const detectionOutput = document.getElementById('detectionOutput');
    const detectionResult = document.getElementById('detectionResult');
    const detectionProgress = document.getElementById('detectionProgress');
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    
    // Show detection output and set progress
    detectionOutput.classList.remove('d-none');
    detectionProgress.style.width = '0%';
    detectionResult.textContent = "Preparing for detection...";
    
    try {
        // Update progress
        detectionProgress.style.width = '10%';
        
        // Load model if needed
        if (!cocoSsdModel) {
            detectionResult.textContent = "Loading model...";
            cocoSsdModel = await cocoSsd.load();
        }
        
        // Update progress
        detectionProgress.style.width = '30%';
        detectionResult.textContent = "Preparing image...";
        
        // Set up canvas with image dimensions
        let imgWidth = modalImage.naturalWidth || 640;
        let imgHeight = modalImage.naturalHeight || 480;
        if (imgWidth === 0) imgWidth = 640;
        if (imgHeight === 0) imgHeight = 480;
        
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        
        // Draw placeholder in case of CORS issues
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#666666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Attempting to process image...', canvas.width / 2, canvas.height / 2);
        
        // Update progress
        detectionProgress.style.width = '40%';
        
        // Draw image to canvas and handle CORS issues
        let imageLoadSuccess = false;
        try {
            ctx.drawImage(modalImage, 0, 0, canvas.width, canvas.height);
            detectionResult.textContent = "Image loaded, detecting vehicles...";
            imageLoadSuccess = true;
        } catch (drawError) {
            console.error("Error drawing image to canvas:", drawError);
            detectionResult.textContent = "CORS issue detected, trying alternative approach...";
            
            // Try alternative approach with crossOrigin
            const corsImage = new Image();
            corsImage.crossOrigin = "anonymous";
            
            await Promise.race([
                new Promise(resolve => {
                    corsImage.onload = () => {
                        try {
                            ctx.drawImage(corsImage, 0, 0, canvas.width, canvas.height);
                            imageLoadSuccess = true;
                            resolve();
                        } catch (e) {
                            console.error("Failed to draw CORS image:", e);
                            resolve();
                        }
                    };
                    corsImage.onerror = () => resolve();
                    corsImage.src = modalImage.src;
                }),
                new Promise(resolve => setTimeout(resolve, 5000))
            ]);
            
            if (!imageLoadSuccess) {
                detectionResult.textContent = "Cannot access image due to security restrictions.";
            }
        }
        
        // Update progress
        detectionProgress.style.width = '60%';
        detectionResult.textContent = "Running detection algorithm...";
        
        // Run object detection
        let detections = [];
        try {
            const predictions = await cocoSsdModel.detect(canvas);
            const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'];
            detections = predictions.filter(p => vehicleClasses.includes(p.class));
        } catch (detectionError) {
            console.error("Detection error:", detectionError);
            detectionResult.textContent = "Detection failed, using fallback values.";
        }
        
        // Update progress and process results
        detectionProgress.style.width = '80%';
        detectionResult.textContent = "Processing results...";
        
        const { vehicleCount, congestionLevel } = processDetectionResults(detections, ctx);
        
        // Show analysis result
        detectionResult.textContent = `Detected ${vehicleCount} vehicles (${congestionLevel} congestion)`;
        detectionProgress.style.width = '100%';
        
        // Switch to analysis tab and update content
        document.getElementById('analysis-tab').click();
        document.getElementById('modalAnalysisContent').innerHTML = `
            <div class="alert alert-success">
                <h6><i class="fas fa-check-circle me-2"></i>Analysis Complete</h6>
                <p>Detected ${vehicleCount} vehicles</p>
                <p>Congestion level: <strong>${congestionLevel.toUpperCase()}</strong></p>
            </div>
            <div class="mt-3">
                <h6>Vehicle Types:</h6>
                <ul class="list-group">
                    ${getVehicleTypeCounts(detections)}
                </ul>
            </div>
        `;
    } catch (error) {
        console.error("Error in vehicle detection:", error);
        detectionResult.textContent = "Error: " + error.message;
        detectionProgress.style.width = '100%';
        detectionProgress.classList.remove('bg-success');
        detectionProgress.classList.add('bg-danger');
        
        document.getElementById('analysis-tab').click();
        document.getElementById('modalAnalysisContent').innerHTML = `
            <div class="alert alert-danger">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Analysis Failed</h6>
                <p>${error.message}</p>
                <p class="small text-muted mt-2">This error often occurs due to Cross-Origin Resource Sharing (CORS) restrictions.</p>
            </div>
        `;
    }
}

// Count vehicle types
function getVehicleTypeCounts(detections) {
    const counts = {};
    detections.forEach(d => counts[d.class] = (counts[d.class] || 0) + 1);
    
    let html = '';
    for (const [type, count] of Object.entries(counts)) {
        html += `<li class="list-group-item d-flex justify-content-between align-items-center">
            ${type.charAt(0).toUpperCase() + type.slice(1)}
            <span class="badge bg-primary rounded-pill">${count}</span>
        </li>`;
    }
    
    return html || '<li class="list-group-item">No vehicles detected</li>';
}

// Draw bounding boxes for detections
function drawDetections(ctx, detections) {
    // Clear canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Draw the image again
    const img = document.getElementById('modalImage');
    ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Set styles for bounding boxes
    ctx.lineWidth = 3;
    ctx.font = '16px Arial';
    ctx.textBaseline = 'top';
    
    // Draw each detection
    detections.forEach(detection => {
        // Set color based on vehicle type
        switch (detection.class) {
            case 'car': ctx.strokeStyle = ctx.fillStyle = '#FF0000'; break; // Red
            case 'truck': ctx.strokeStyle = ctx.fillStyle = '#00FF00'; break; // Green
            case 'bus': ctx.strokeStyle = ctx.fillStyle = '#0000FF'; break; // Blue
            case 'motorcycle': ctx.strokeStyle = ctx.fillStyle = '#FFFF00'; break; // Yellow
            case 'bicycle': ctx.strokeStyle = ctx.fillStyle = '#FF00FF'; break; // Magenta
            default: ctx.strokeStyle = ctx.fillStyle = '#FFFFFF'; // White
        }
        
        // Draw bounding box
        const [x, y, width, height] = detection.bbox;
        ctx.strokeRect(x, y, width, height);
        
        // Draw label background
        const textWidth = ctx.measureText(`${detection.class}: ${Math.round(detection.score * 100)}%`).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x, y, textWidth + 10, 20);
        
        // Draw label text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${detection.class}: ${Math.round(detection.score * 100)}%`, x + 5, y);
    });
}

// Analyze current image
async function analyzeCurrentImage() {
    const modalImage = document.getElementById('modalImage');
    const modalAnalysisContent = document.getElementById('modalAnalysisContent');
    const analysisProgress = document.getElementById('analysisProgress');
    
    // Show progress bar
    analysisProgress.classList.remove('d-none');
    analysisProgress.querySelector('.progress-bar').style.width = '20%';
    
    try {
        // Handle image loading
        if (!modalImage.complete || modalImage.naturalWidth === 0) {
            await new Promise((resolve, reject) => {
                modalImage.onload = resolve;
                modalImage.onerror = () => reject(new Error("Failed to load image"));
                setTimeout(() => reject(new Error("Image load timeout")), 5000);
            });
        }
        
        // Create a CORS-friendly image
        const tempImage = new Image();
        tempImage.crossOrigin = "anonymous";
        
        await new Promise((resolve, reject) => {
            tempImage.onload = resolve;
            tempImage.onerror = () => reject(new Error("Failed to load temporary image"));
            tempImage.src = modalImage.src;
            setTimeout(() => reject(new Error("Temporary image load timeout")), 5000);
        });
        
        // Detect vehicles
        analysisProgress.querySelector('.progress-bar').style.width = '40%';
        const detectionResult = await detectVehicles(tempImage);
        
        // Update vehicle count and congestion level
        document.getElementById('modalVehicles').textContent = detectionResult.vehicleCount;
        document.getElementById('vehicleSource').textContent = "(detected)";
        document.getElementById('modalCongestion').textContent = detectionResult.congestionLevel.charAt(0).toUpperCase() + detectionResult.congestionLevel.slice(1);
        document.getElementById('congestionSource').textContent = "(detected)";
        
        // Update progress
        analysisProgress.querySelector('.progress-bar').style.width = '60%';
        
        // Get image metadata
        const cameraId = document.getElementById('modalCameraId').textContent;
        const dateTime = document.getElementById('modalDateTime').textContent;
        
        // Generate a caption using LLM
        const prompt = `Analyze this traffic camera image (Camera ID: ${cameraId}, Time: ${dateTime}):
        
        Vehicle count: ${detectionResult.vehicleCount}
        Congestion level: ${detectionResult.congestionLevel}
        
        Please provide:
        1. A brief description of the traffic conditions
        2. Any notable observations about the road or environment
        3. Traffic flow assessment
        
        Be concise and focus on factual observations.`;
        
        // Update progress
        analysisProgress.querySelector('.progress-bar').style.width = '80%';
        
        // Generate analysis
        const analysis = await generateImageAnalysis(prompt);
        
        // Update the caption in the data
        const currentImage = document.querySelector('.image-card.active');
        if (currentImage) {
            const index = parseInt(currentImage.dataset.index);
            if (filteredData[index]) {
                filteredData[index].caption = analysis;
                document.getElementById('modalCaption').textContent = analysis;
            }
        }
        
        // Switch to the analysis tab
        document.getElementById('analysis-tab').click();
        
        // Display the analysis
        modalAnalysisContent.innerHTML = `
            <div class="card border-0 bg-light mb-3">
                <div class="card-body">
                    <h6 class="text-primary mb-2">Traffic Analysis</h6>
                    <p>${analysis}</p>
                </div>
            </div>
            <div class="card border-0 bg-light">
                <div class="card-body">
                    <h6 class="text-primary mb-2">Vehicle Detection</h6>
                    <p><strong>Vehicles detected:</strong> ${detectionResult.vehicleCount}</p>
                    <p><strong>Congestion level:</strong> ${detectionResult.congestionLevel.toUpperCase()}</p>
                    <div class="mt-2">
                        <h6>Vehicle Types:</h6>
                        <ul class="list-group">
                            ${getVehicleTypeCounts(detectionResult.detections)}
                        </ul>
                    </div>
                </div>
            </div>
        `;
        
        // Complete progress
        analysisProgress.querySelector('.progress-bar').style.width = '100%';
        setTimeout(() => analysisProgress.classList.add('d-none'), 1000);
    } catch (error) {
        console.error("Error analyzing image:", error);
        modalAnalysisContent.innerHTML = `
            <div class="alert alert-danger">
                <strong>Error analyzing image:</strong> ${error.message}
            </div>
        `;
        
        // Show error in progress
        analysisProgress.querySelector('.progress-bar').style.width = '100%';
        analysisProgress.querySelector('.progress-bar').classList.remove('bg-success');
        analysisProgress.querySelector('.progress-bar').classList.add('bg-danger');
        setTimeout(() => analysisProgress.classList.add('d-none'), 1000);
    }
}

// Generate image analysis with LLM
async function generateImageAnalysis(prompt) {
    try {
        const response = await fetch('https://llmfoundry.straive.com/gemini/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: "include",
            body: JSON.stringify({
                model: 'gemini-2.0-flash',
                messages: [
                    { role: 'system', content: 'You are a traffic analysis assistant that provides concise, factual observations about traffic conditions.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 150
            })
        });
        
        if (!response.ok) return "Traffic conditions appear normal with typical flow for this time of day.";
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("Error calling LLM API:", error);
        return "Traffic conditions appear normal with typical flow for this time of day.";
    }
}

// Analyze all images in the dataset
async function analyzeAllImages() {
    if (!trafficData?.data?.length) {
        alert("Please load data first.");
        return;
    }
    
    // Show analyze button as disabled
    const analyzeAllBtn = document.getElementById('analyzeAllBtn');
    analyzeAllBtn.disabled = true;
    analyzeAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Analyzing...';
    
    // Count how many images to analyze (limit to 1000)
    const totalImages = Math.min(trafficData.data.length, 100);
    let analyzedCount = 0;
    let errorCount = 0;
    
    try {
        for (let i = 0; i < totalImages; i++) {
            const item = trafficData.data[i];
            
            try {
                // Create a temporary image element
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = getImagePath(item);
                
                // Wait for image to load with timeout
                try {
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = () => reject(new Error(`Failed to load image: ${item.filename}`));
                        if (img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
                            reject(new Error(`Image has invalid dimensions: ${item.filename}`));
                        }
                        setTimeout(() => {
                            console.warn(`Image load timeout for: ${item.filename}`);
                            resolve();
                        }, 3000);
                    });
                    
                    // Only process if image loaded successfully
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                        const detectionResult = await detectVehicles(img);
                        
                        // Update the data
                        trafficData.data[i].num_vehicles = detectionResult.vehicleCount;
                        trafficData.data[i].congestion_level = detectionResult.congestionLevel;
                        trafficData.data[i].vehicles_analyzed = true;
                        
                        // Generate a simple caption if none exists
                        if (!trafficData.data[i].caption || trafficData.data[i].caption === 'No caption available') {
                            trafficData.data[i].caption = `Traffic camera image showing ${detectionResult.vehicleCount} vehicles with ${detectionResult.congestionLevel} congestion.`;
                        }
                    } else {
                        // Use default values for invalid images
                        trafficData.data[i].num_vehicles = 0;
                        trafficData.data[i].congestion_level = 'low';
                        errorCount++;
                    }
                } catch (imageError) {
                    console.error(`Error processing image ${i}:`, imageError);
                    trafficData.data[i].num_vehicles = 0;
                    trafficData.data[i].congestion_level = 'low';
                    errorCount++;
                }
                
                analyzedCount++;
                
                // Update progress every 5 images
                if (analyzedCount % 5 === 0) {
                    analyzeAllBtn.innerHTML = `<i class="fas fa-spinner fa-spin me-1"></i> Analyzing ${analyzedCount}/${totalImages}...`;
                }
            } catch (itemError) {
                console.error(`Error processing item ${i}:`, itemError);
                errorCount++;
                continue;
            }
        }
        
        // Update data and UI
        filteredData = [...trafficData.data];
        updateCongestionStatistics();
        updateCharts();
        displayImages(filteredData, currentPage);
        generateTrafficInsights();
        
        // Re-enable button and show status
        analyzeAllBtn.disabled = false;
        analyzeAllBtn.innerHTML = errorCount > 0 
            ? `<i class="fas fa-check me-1"></i> Analysis Completed (${errorCount} errors)`
            : '<i class="fas fa-check me-1"></i> Analysis Complete';
        
        setTimeout(() => {
            analyzeAllBtn.innerHTML = '<i class="fas fa-brain me-1"></i> Analyze All Images';
        }, 3000);
    } catch (error) {
        console.error("Error analyzing all images:", error);
        alert("Error analyzing images: " + error.message);
        
        analyzeAllBtn.disabled = false;
        analyzeAllBtn.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i> Analysis Failed';
        
        setTimeout(() => {
            analyzeAllBtn.innerHTML = '<i class="fas fa-brain me-1"></i> Analyze All Images';
        }, 3000);
    }
}

// Update congestion statistics
function updateCongestionStatistics() {
    // Count congestion levels
    const congestionCounts = { low: 0, medium: 0, high: 0 };
    
    trafficData.data.forEach(item => {
        congestionCounts[item.congestion_level in congestionCounts ? item.congestion_level : 'low']++;
    });
    
    // Update UI
    document.getElementById('lowCongestion').textContent = `Low: ${congestionCounts.low}`;
    document.getElementById('mediumCongestion').textContent = `Medium: ${congestionCounts.medium}`;
    document.getElementById('highCongestion').textContent = `High: ${congestionCounts.high}`;
    
    // Update trafficData stats
    trafficData.stats.congestion = congestionCounts;
}

// Update charts with analyzed data
function updateCharts() {
    if (!trafficData?.data?.length) return;
    
    // Prepare aggregation containers
    const hourlyData = Array(24).fill(0);
    const hourlyCount = Array(24).fill(0);
    const dateVehicleCounts = {};
    const cameraVehicleCounts = {};
    
    // Process data
    trafficData.data.forEach(item => {
        const hour = item.hour >= 0 && item.hour < 24 ? item.hour : 0;
        const vehicles = item.num_vehicles || 0;
        
        // Update hourly data
        hourlyData[hour] += vehicles;
        hourlyCount[hour]++;
        
        // Update date data
        if (item.date) {
            if (!dateVehicleCounts[item.date]) dateVehicleCounts[item.date] = { total: 0, count: 0 };
            dateVehicleCounts[item.date].total += vehicles;
            dateVehicleCounts[item.date].count++;
        }
        
        // Update camera data
        const cameraId = item.camera_id.toString();
        if (!cameraVehicleCounts[cameraId]) cameraVehicleCounts[cameraId] = { total: 0, count: 0 };
        cameraVehicleCounts[cameraId].total += vehicles;
        cameraVehicleCounts[cameraId].count++;
    });
    
    // Calculate averages
    const hourlyAverages = hourlyData.map((total, index) => 
        hourlyCount[index] > 0 ? total / hourlyCount[index] : 0
    );
    
    const dateAverages = {};
    for (const [date, data] of Object.entries(dateVehicleCounts)) {
        dateAverages[date] = data.count > 0 ? data.total / data.count : 0;
    }
    
    const cameraAverages = {};
    for (const [camera, data] of Object.entries(cameraVehicleCounts)) {
        cameraAverages[camera] = data.count > 0 ? data.total / data.count : 0;
    }
    
    // Get top cameras by average vehicle count
    const topCameras = Object.entries(cameraAverages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    // Update Traffic Volume Chart (by date)
    const dates = Object.keys(dateAverages).sort();
    trafficVolumeChart.data.labels = dates;
    trafficVolumeChart.data.datasets[0].data = dates.map(date => dateAverages[date]);
    trafficVolumeChart.update();
    
    // Update Congestion Chart
    congestionChart.data.datasets[0].data = [
        trafficData.stats.congestion.low,
        trafficData.stats.congestion.medium,
        trafficData.stats.congestion.high
    ];
    congestionChart.update();
    
    // Update Hourly Traffic Chart
    hourlyTrafficChart.data.datasets[0].data = hourlyAverages;
    hourlyTrafficChart.update();
    
    // Update Top Cameras Chart
    topCamerasChart.data.labels = topCameras.map(([camera]) => `Camera ${camera}`);
    topCamerasChart.data.datasets[0].data = topCameras.map(([_, avg]) => avg);
    topCamerasChart.update();
    
    // Initialize map if not already done
    initializeTrafficMap(cameraAverages);
}

// Initialize traffic map
function initializeTrafficMap(cameraData) {
    // Update markers if map exists
    if (trafficMap) {
        updateMapMarkers(cameraData);
        return;
    }
    
    // Initialize map
    trafficMap = L.map('trafficMap').setView(SINGAPORE_COORDS.center, 12);
    
    // Add tile layer (map style)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(trafficMap);
    
    // Add markers for cameras
    updateMapMarkers(cameraData);
}

// Update map markers with traffic data
function updateMapMarkers(cameraData) {
    if (!trafficMap) return;
    
    // Clear existing markers
    markers.forEach(marker => trafficMap.removeLayer(marker));
    markers = [];
    
    // Add markers for each camera
    for (const [cameraId, avgVehicles] of Object.entries(cameraData)) {
        // Skip if no location data for this camera
        if (!SAMPLE_CAMERA_LOCATIONS[cameraId] && !SINGAPORE_COORDS.cameras[cameraId]) continue;
        
        // Get camera location (use sample location if coordinates not in data)
        const location = SINGAPORE_COORDS.cameras[cameraId] || SAMPLE_CAMERA_LOCATIONS[cameraId];
        if (!location) continue;
        
        // Determine marker color based on average vehicle count
        let markerColor = avgVehicles > 10 ? 'red' : (avgVehicles > 5 ? 'orange' : 'green');
        
        // Create custom icon
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        
        // Add marker to map
        const marker = L.marker(location, { icon: icon }).addTo(trafficMap);
        
        // Add popup with camera info
        marker.bindPopup(`
            <strong>Camera ${cameraId}</strong><br>
            Average Vehicles: ${avgVehicles.toFixed(1)}<br>
            <button class="btn btn-sm btn-primary mt-2 show-camera-btn" data-camera-id="${cameraId}">
                Show Images
            </button>
        `);
        
        // Add to markers array
        markers.push(marker);
        
        // Add event listener to popup content
        marker.on('popupopen', function() {
            document.querySelectorAll('.show-camera-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const cameraId = this.getAttribute('data-camera-id');
                    document.getElementById('cameraFilter').value = cameraId;
                    applyFilters();
                    
                    // Switch to image gallery
                    document.getElementById('insightsTabs').querySelector('a[href="#images"]').click();
                });
            });
        });
    }
}

// Generate traffic insights
async function generateTrafficInsights() {
    const keyInsightsDiv = document.getElementById('keyInsights');
    const peakHoursDiv = document.getElementById('peakHoursAnalysis');
    const cameraInsightsDiv = document.getElementById('cameraInsights');
    
    // Show loading indicators
    keyInsightsDiv.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Generating insights...</div>';
    peakHoursDiv.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Analyzing peak hours...</div>';
    cameraInsightsDiv.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Analyzing camera data...</div>';
    
    try {
        // Prepare data for analysis
        const trafficStats = {
            totalImages: trafficData.data.length,
            totalCameras: trafficData.filters.cameras.length,
            congestion: trafficData.stats.congestion,
            hourlyData: {},
            cameraData: {}
        };
        
        // Calculate hourly statistics
        const hourlyVehicles = Array(24).fill(0);
        const hourlyCount = Array(24).fill(0);
        
        trafficData.data.forEach(item => {
            const hour = item.hour >= 0 && item.hour < 24 ? item.hour : 0;
            const vehicles = item.num_vehicles || 0;
            
            hourlyVehicles[hour] += vehicles;
            hourlyCount[hour]++;
        });
        
        // Calculate hourly averages
        for (let i = 0; i < 24; i++) {
            trafficStats.hourlyData[i] = {
                average: hourlyCount[i] > 0 ? hourlyVehicles[i] / hourlyCount[i] : 0,
                count: hourlyCount[i]
            };
        }
        
        // Calculate camera statistics
        const cameraData = {};
        trafficData.data.forEach(item => {
            const cameraId = item.camera_id.toString();
            const vehicles = item.num_vehicles || 0;
            
            if (!cameraData[cameraId]) {
                cameraData[cameraId] = { total: 0, count: 0, congestion: { low: 0, medium: 0, high: 0 } };
            }
            
            cameraData[cameraId].total += vehicles;
            cameraData[cameraId].count++;
            cameraData[cameraId].congestion[item.congestion_level]++;
        });
        
        // Calculate camera averages
        for (const [cameraId, data] of Object.entries(cameraData)) {
            trafficStats.cameraData[cameraId] = {
                average: data.count > 0 ? data.total / data.count : 0,
                count: data.count,
                congestion: data.congestion
            };
        }
        
        // Generate insights using LLM
        const keyInsights = await generateInsightsWithLLM("general", trafficStats);
        const peakHoursInsights = await generateInsightsWithLLM("hourly", trafficStats);
        const cameraInsights = await generateInsightsWithLLM("cameras", trafficStats);
        
        // Update UI
        keyInsightsDiv.innerHTML = `<div class="p-3">${keyInsights}</div>`;
        peakHoursDiv.innerHTML = `<div class="p-3">${peakHoursInsights}</div>`;
        cameraInsightsDiv.innerHTML = `<div class="p-3">${cameraInsights}</div>`;
    } catch (error) {
        console.error("Error generating insights:", error);
        
        // Show error message
        keyInsightsDiv.innerHTML = '<div class="alert alert-warning">Failed to generate insights. Please try again.</div>';
        peakHoursDiv.innerHTML = '<div class="alert alert-warning">Failed to analyze peak hours. Please try again.</div>';
        cameraInsightsDiv.innerHTML = '<div class="alert alert-warning">Failed to analyze camera data. Please try again.</div>';
    }
}

// Generate insights with LLM
async function generateInsightsWithLLM(insightType, trafficStats) {
    try {
        let prompt = "";
        
        switch (insightType) {
            case "general":
                prompt = `Analyze the following traffic data and provide 3-4 key insights about overall traffic patterns:

Total images: ${trafficStats.totalImages}
Total cameras: ${trafficStats.totalCameras}
Congestion levels: Low (${trafficStats.congestion.low}), Medium (${trafficStats.congestion.medium}), High (${trafficStats.congestion.high})

Format the insights as bullet points and focus on meaningful patterns in the data.`;
                break;
                
            case "hourly":
                // Find peak hours
                const hourlyData = Object.entries(trafficStats.hourlyData)
                    .map(([hour, data]) => ({ hour: parseInt(hour), average: data.average }))
                    .sort((a, b) => b.average - a.average);
                
                const peakHours = hourlyData.slice(0, 3);
                
                prompt = `Analyze the following hourly traffic data and provide insights about peak hours:

Top 3 peak hours:
${peakHours.map(h => `${h.hour}:00 - Average vehicles: ${h.average.toFixed(1)}`).join('\n')}

Provide 2-3 bullet points about peak hour traffic patterns, potential reasons for these patterns, and suggestions for traffic management during these hours.`;
                break;
                
            case "cameras":
                // Find busiest cameras
                const cameraData = Object.entries(trafficStats.cameraData)
                    .map(([cameraId, data]) => ({ 
                        cameraId, 
                        average: data.average,
                        highCongestion: data.congestion.high
                    }))
                    .sort((a, b) => b.average - a.average);
                
                const busiestCameras = cameraData.slice(0, 3);
                
                prompt = `Analyze the following camera traffic data and provide insights:

Top 3 busiest cameras:
${busiestCameras.map(c => `Camera ${c.cameraId} - Average vehicles: ${c.average.toFixed(1)}, High congestion instances: ${c.highCongestion}`).join('\n')}

Provide 2-3 bullet points about these high-traffic camera locations, potential reasons for higher traffic, and suggestions for traffic management at these locations.`;
                break;
                
            default:
                return "No insights available.";
        }
        
        // Call LLM API
        const response = await fetch('https://llmfoundry.straive.com/gemini/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: "include",
            body: JSON.stringify({
                model: 'gemini-2.0-flash',
                messages: [
                    { role: 'system', content: 'You are a traffic analysis AI that provides concise, practical insights from traffic data.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 250
            })
        });
        
        if (!response.ok) throw new Error('Failed to generate insights');
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error(`Error generating ${insightType} insights:`, error);
        return `<div class="alert alert-warning">Unable to generate insights at this time. Please try again later.</div>`;
    }
}

// Detect traffic anomalies
async function detectAnomalies() {
    if (!trafficData?.data?.length) {
        alert("Please load and analyze data first.");
        return;
    }
    
    const anomalyButton = document.getElementById('detectAnomaliesBtn');
    const anomalyResults = document.getElementById('anomalyResults');
    const anomalyList = document.getElementById('anomalyList');
    
    // Show loading state
    anomalyButton.disabled = true;
    anomalyButton.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Detecting...';
    anomalyList.innerHTML = '';
    anomalyResults.classList.add('d-none');
    
    try {
        // Get analyzed data
        const analyzedData = trafficData.data.filter(item => 
            item.num_vehicles !== undefined && item.congestion_level !== undefined
        );
        
        if (analyzedData.length === 0) {
            throw new Error("No analyzed data available. Please analyze images first.");
        }
        
        // Calculate statistics for anomaly detection
        const vehicleCounts = analyzedData.map(item => item.num_vehicles);
        const meanVehicles = vehicleCounts.reduce((sum, count) => sum + count, 0) / vehicleCounts.length;
        const stdDevVehicles = Math.sqrt(
            vehicleCounts.reduce((sum, count) => sum + Math.pow(count - meanVehicles, 2), 0) / vehicleCounts.length
        );
        
        // Define anomaly threshold (mean + 2 standard deviations)
        const anomalyThreshold = meanVehicles + (2 * stdDevVehicles);
        
        // Find anomalies
        const anomalies = analyzedData
            .filter(item => item.num_vehicles > anomalyThreshold || item.congestion_level === 'high')
            .sort((a, b) => b.num_vehicles - a.num_vehicles)
            .slice(0, 5); // Get top 5 anomalies
        
        if (anomalies.length === 0) {
            anomalyList.innerHTML = `
                <li class="list-group-item text-center text-muted">
                    No significant traffic anomalies detected
                </li>
            `;
        } else {
            // Display anomalies
            anomalies.forEach(item => {
                const listItem = document.createElement('li');
                listItem.className = 'list-group-item';
                listItem.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>Camera ${item.camera_id}</strong> - ${formatDateTime(item.datetime)}
                            <p class="mb-1">
                                <span class="badge bg-${item.congestion_level === 'high' ? 'danger' : 'warning'}">
                                    ${item.num_vehicles} vehicles
                                </span>
                                <span class="ms-2 text-muted">
                                    ${item.congestion_level.toUpperCase()} congestion
                                </span>
                            </p>
                        </div>
                        <button class="btn btn-sm btn-outline-primary view-anomaly" data-filename="${item.filename}">
                            View
                        </button>
                    </div>
                `;
                anomalyList.appendChild(listItem);
            });
            
            // Add event listeners to view buttons
            document.querySelectorAll('.view-anomaly').forEach(button => {
                button.addEventListener('click', function() {
                    const filename = this.getAttribute('data-filename');
                    const anomalyItem = trafficData.data.find(item => item.filename === filename);
                    if (anomalyItem) showImageDetails(anomalyItem);
                });
            });
            
            // Generate anomaly analysis with LLM
            const anomalyInsight = await generateAnomalyInsight(anomalies);
            
            // Add insight to the top of the list
            const insightItem = document.createElement('li');
            insightItem.className = 'list-group-item list-group-item-warning';
            insightItem.innerHTML = `
                <div class="mb-2"><strong><i class="fas fa-exclamation-triangle me-2"></i>Anomaly Analysis</strong></div>
                <p>${anomalyInsight}</p>
            `;
            anomalyList.insertBefore(insightItem, anomalyList.firstChild);
        }
        
        // Show results
        anomalyResults.classList.remove('d-none');
    } catch (error) {
        console.error("Error detecting anomalies:", error);
        
        // Show error
        anomalyList.innerHTML = `
            <li class="list-group-item list-group-item-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Error: ${error.message}
            </li>
        `;
        anomalyResults.classList.remove('d-none');
    } finally {
        // Reset button
        anomalyButton.disabled = false;
        anomalyButton.innerHTML = '<i class="fas fa-search me-1"></i>Detect Anomalies';
    }
}

// Generate insight about traffic anomalies
async function generateAnomalyInsight(anomalies) {
    try {
        const anomalyData = anomalies.map(item => 
            `Camera ${item.camera_id} - ${formatDateTime(item.datetime)} - ${item.num_vehicles} vehicles - ${item.congestion_level} congestion`
        ).join('\n');
        
        const prompt = `Analyze these traffic anomalies and provide a brief insight about potential causes and impacts:

${anomalyData}

Provide 2-3 sentences about patterns in these anomalies, potential causes, and recommendations for traffic management.`;
        
        // Call LLM API
        const response = await fetch('https://llmfoundry.straive.com/gemini/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: "include",
            body: JSON.stringify({
                model: 'gemini-2.0-flash',
                messages: [
                    { role: 'system', content: 'You are a traffic analysis AI that provides concise insights about traffic anomalies.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 150
            })
        });
        
        if (!response.ok) {
            return "These anomalies indicate unusual traffic patterns that may require attention. Consider monitoring these locations more closely.";
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("Error generating anomaly insight:", error);
        return "These anomalies indicate unusual traffic patterns that may require attention. Consider monitoring these locations more closely.";
    }
}

// Handle CSV file upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Show loading indicator
    document.getElementById('loadingIndicator').classList.remove('d-none');
    
    try {
        // Ensure Pyodide is loaded
        if (!pyodide) {
            console.log("Pyodide not loaded yet, initializing...");
            await initPyodide();
        }
        
        // Read the file as text
        const csvText = await readFileAsText(file);
        
        // Process the CSV data with Pyodide
        await processCSVWithPyodide(csvText);
        
        // Show analyze all button and hide loading indicator
        document.getElementById('analyzeAllBtn').classList.remove('d-none');
        document.getElementById('loadingIndicator').classList.add('d-none');
    } catch (error) {
        console.error("Error processing file:", error);
        alert("Error processing file: " + error.message);
        document.getElementById('loadingIndicator').classList.add('d-none');
    }
}

// Read file as text
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}

// Process CSV with Pyodide
async function processCSVWithPyodide(csvText) {
    try {
        // Store CSV in Pyodide filesystem
        pyodide.FS.writeFile('traffic_data.csv', csvText);
        
        // Define Python code to process the CSV
        const pythonCode = `
import pandas as pd
import json
from datetime import datetime

# Read the CSV file
df = pd.read_csv('traffic_data.csv')

# Check if required columns exist, if not add them with placeholder values
required_columns = ['filename', 'camera_id', 'datetime', 'date', 'hour', 'weekday', 'path', 
                   'num_vehicles', 'congestion_level', 'caption']

for col in required_columns:
    if col not in df.columns:
        if col == 'num_vehicles':
            df[col] = 0  # Default to 0 vehicles
        elif col == 'congestion_level':
            df[col] = 'low'  # Default to low congestion
        elif col == 'caption':
            df[col] = 'No caption available'  # Default caption
        elif col == 'date' and 'datetime' in df.columns:
            # Try to extract date from datetime if possible
            try:
                df['date'] = pd.to_datetime(df['datetime']).dt.date.astype(str)
            except:
                df['date'] = 'Unknown'
        elif col == 'hour' and 'datetime' in df.columns:
            # Try to extract hour from datetime if possible
            try:
                df['hour'] = pd.to_datetime(df['datetime']).dt.hour
            except:
                df['hour'] = -1
        elif col == 'weekday' and 'datetime' in df.columns:
            # Try to extract weekday from datetime if possible
            try:
                df['weekday'] = pd.to_datetime(df['datetime']).dt.day_name()
            except:
                df['weekday'] = 'Unknown'
        else:
            df[col] = 'Unknown'  # Default for other missing columns

# Extract unique values for filters
unique_cameras = df['camera_id'].unique().tolist()
unique_dates = df['date'].unique().tolist()
unique_hours = sorted(df['hour'].unique().tolist())

# Get statistics
total_images = len(df)
total_cameras = len(unique_cameras)

# Count congestion levels
congestion_counts = df['congestion_level'].value_counts().to_dict()
low_count = congestion_counts.get('low', 0)
medium_count = congestion_counts.get('medium', 0)
high_count = congestion_counts.get('high', 0)

# Generate daily summaries grouped by date
daily_summaries = {}
for date in unique_dates:
    date_df = df[df['date'] == date]
    captions = date_df['caption'].tolist()
    
    # Generate a summary from captions (placeholder for OpenAI API call)
    summary = "Daily summary for " + date + ": Traffic patterns varied throughout the day."
    daily_summaries[date] = summary

# Convert dataframe to JSON for JavaScript
df_json = df.to_json(orient='records')

# Create a result dictionary
result = {
    'data': json.loads(df_json),
    'filters': {
        'cameras': unique_cameras,
        'dates': unique_dates,
        'hours': unique_hours
    },
    'stats': {
        'total_images': total_images,
        'total_cameras': total_cameras,
        'congestion': {
            'low': low_count,
            'medium': medium_count,
            'high': high_count
        }
    },
    'daily_summaries': daily_summaries
}

# Convert result to JSON
result_json = json.dumps(result)
        `;
        
        // Run the Python code
        await pyodide.runPythonAsync(pythonCode);
        
        // Get the result
        const resultJson = pyodide.globals.get('result_json');
        trafficData = JSON.parse(resultJson);
        
        // Initialize the dashboard with the data
        initializeDashboard(trafficData);
    } catch (error) {
        console.error("Error in Pyodide processing:", error);
        throw error;
    }
}

// Initialize the dashboard with the data
function initializeDashboard(data) {
    console.log("Initializing dashboard with data:", data);
    
    // Initialize filters, update statistics, and set filtered data
    populateFilters(data.filters);
    updateStatistics(data.stats);
    filteredData = [...data.data];
    
    // Display images and generate pagination
    displayImages(filteredData, currentPage);
    generatePagination(filteredData.length);
    
    // Initialize and update charts
    updateCharts();
    
    // Set up fake camera coordinates
    setupCameraCoordinates(data.filters.cameras);
}

// Set up sample camera coordinates
function setupCameraCoordinates(cameraIds) {
    // Reset camera coordinates
    SINGAPORE_COORDS.cameras = {};
    
    // Assign sample coordinates to cameras
    cameraIds.forEach((cameraId) => {
        const cameraIdStr = cameraId.toString();
        
        // Use sample location if available, otherwise generate random location
        if (SAMPLE_CAMERA_LOCATIONS[cameraIdStr]) {
            SINGAPORE_COORDS.cameras[cameraIdStr] = SAMPLE_CAMERA_LOCATIONS[cameraIdStr];
        } else {
            // Generate random location within Singapore's general area
            const lat = SINGAPORE_COORDS.center[0] + (Math.random() - 0.5) * 0.2;
            const lng = SINGAPORE_COORDS.center[1] + (Math.random() - 0.5) * 0.2;
            SINGAPORE_COORDS.cameras[cameraIdStr] = [lat, lng];
        }
    });
}

// Populate filter dropdowns
function populateFilters(filters) {
    // Helper function to populate dropdown options
    const populateDropdown = (id, options, textFn) => {
        const dropdown = document.getElementById(id);
        dropdown.innerHTML = '<option value="all">All ' + id.replace('Filter', 's') + '</option>';
        
        options.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = textFn(value);
            dropdown.appendChild(option);
        });
    };
    
    // Populate hour filter
    populateDropdown('hourFilter', filters.hours, 
        hour => hour >= 0 ? `${hour}:00 - ${hour}:59` : 'Unknown');
    
    // Populate camera filter
    populateDropdown('cameraFilter', filters.cameras, 
        camera => `Camera ${camera}`);
    
    // Populate date filter
    populateDropdown('dateFilter', filters.dates, 
        date => date);
}

// Update statistics display
function updateStatistics(stats) {
    document.getElementById('totalImages').textContent = stats.total_images;
    document.getElementById('totalCameras').textContent = stats.total_cameras;
    document.getElementById('lowCongestion').textContent = `Low: ${stats.congestion.low}`;
    document.getElementById('mediumCongestion').textContent = `Medium: ${stats.congestion.medium}`;
    document.getElementById('highCongestion').textContent = `High: ${stats.congestion.high}`;
}

// Display images in the gallery
function displayImages(data, page) {
    const gallery = document.getElementById('imageGallery');
    gallery.innerHTML = '';
    
    // Calculate start and end indices for pagination
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, data.length);
    
    // If no images, show message
    if (data.length === 0) {
        gallery.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-exclamation-circle fa-3x text-warning mb-3"></i>
                <p>No images match the selected filters.</p>
            </div>`;
        return;
    }
    
    // Add images to gallery
    for (let i = startIndex; i < endIndex; i++) {
        const item = data[i];
        
        // Determine congestion badge color
        const badgeClass = item.congestion_level === 'high' ? 'bg-danger' : 
                          (item.congestion_level === 'medium' ? 'bg-warning' : 'bg-success');
        
        // Create column with image card
        const col = document.createElement('div');
        col.className = 'col';
        col.innerHTML = `
            <div class="card h-100 shadow-sm image-card" data-index="${i}">
                <div class="position-relative">
                    <img src="${getImagePath(item)}" class="card-img-top" alt="Traffic Camera Image" 
                         onerror="this.src='https://via.placeholder.com/300x200?text=Image+Not+Found'">
                    <span class="position-absolute top-0 end-0 badge ${badgeClass} m-2">
                        Vehicles: ${item.num_vehicles}
                    </span>
                </div>
                <div class="card-body">
                    <h6 class="card-title">Camera ID: ${item.camera_id}</h6>
                    <p class="card-text small">${formatDateTime(item.datetime)}</p>
                </div>
                <div class="card-footer bg-transparent">
                    <button class="btn btn-sm btn-outline-primary view-details">View Details</button>
                </div>
            </div>
        `;
        
        gallery.appendChild(col);
    }
    
    // Add click event listeners to view details buttons
    document.querySelectorAll('.view-details').forEach(button => {
        button.addEventListener('click', function() {
            const card = this.closest('.image-card');
            const index = parseInt(card.dataset.index);
            showImageDetails(data[index]);
            
            // Mark card as active
            document.querySelectorAll('.image-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });
    });
}

// Get image path for displaying in the gallery
function getImagePath(item) {
    return (item.path && !item.path.includes('Unknown')) ? item.path : `${imageBasePath}${item.filename}`;
}

// Format date and time for display
function formatDateTime(dateTimeStr) {
    try {
        return new Date(dateTimeStr).toLocaleString();
    } catch (e) {
        return dateTimeStr;
    }
}

// Generate pagination controls
function generatePagination(totalItems) {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // If no pages, hide pagination
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    // Show pagination
    pagination.style.display = 'flex';
    
    // Create pagination controls
    const createPaginationItem = (page, label, disabled = false, active = false) => {
        const li = document.createElement('li');
        li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${label}</a>`;
        
        if (!disabled) {
            li.addEventListener('click', () => {
                currentPage = page;
                displayImages(filteredData, currentPage);
                generatePagination(filteredData.length);
            });
        }
        
        return li;
    };
    
    // Previous button
    pagination.appendChild(createPaginationItem(
        currentPage - 1, 
        '<span aria-hidden="true">&laquo;</span>', 
        currentPage === 1
    ));
    
    // Page numbers
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pagination.appendChild(createPaginationItem(i, i, false, i === currentPage));
    }
    
    // Next button
    pagination.appendChild(createPaginationItem(
        currentPage + 1, 
        '<span aria-hidden="true">&raquo;</span>', 
        currentPage === totalPages
    ));
}

// Show image details in modal
function showImageDetails(item) {
    // Set modal content
    document.getElementById('modalImage').src = getImagePath(item);
    document.getElementById('modalCameraId').textContent = item.camera_id;
    document.getElementById('modalDateTime').textContent = formatDateTime(item.datetime);
    document.getElementById('modalVehicles').textContent = item.num_vehicles;
    document.getElementById('vehicleSource').textContent = item.vehicles_analyzed ? "(detected)" : "(estimated)";
    document.getElementById('modalCongestion').textContent = item.congestion_level.charAt(0).toUpperCase() + item.congestion_level.slice(1);
    document.getElementById('congestionSource').textContent = item.vehicles_analyzed ? "(detected)" : "(estimated)";
    document.getElementById('modalCaption').textContent = item.caption || 'No caption available';
    
    // Reset analysis content
    document.getElementById('modalAnalysisContent').innerHTML = `
        <p class="text-center text-muted py-4">
            <i class="fas fa-magnifying-glass fa-2x mb-2 d-block"></i>
            Click "Analyze" to process this image
        </p>
    `;
    
    // Show modal and switch to metadata tab
    imageModal.show();
    document.getElementById('metadata-tab').click();
    
    // Hide analysis progress
    document.getElementById('analysisProgress').classList.add('d-none');
}

// Apply filters to the data
function applyFilters() {
    // Get filter values
    const hourFilter = document.getElementById('hourFilter').value;
    const congestionFilter = document.getElementById('congestionFilter').value;
    const cameraFilter = document.getElementById('cameraFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    
    // Filter the data
    filteredData = trafficData.data.filter(item => 
        (hourFilter === 'all' || item.hour.toString() === hourFilter) &&
        (congestionFilter === 'all' || item.congestion_level === congestionFilter) &&
        (cameraFilter === 'all' || item.camera_id.toString() === cameraFilter) &&
        (dateFilter === 'all' || item.date === dateFilter)
    );
    
    // Reset to first page and update UI
    currentPage = 1;
    displayImages(filteredData, currentPage);
    generatePagination(filteredData.length);
    
    // Generate daily summary if a date is selected
    if (dateFilter !== 'all') generateDailySummary();
    
    // Update charts based on filtered data
    updateFilteredCharts();
}

// Update charts based on filtered data
function updateFilteredCharts() {
    if (!filteredData?.length) return;
    
    // Helper for calculating aggregates
    const calculateAggregates = (data) => {
        const hourlyData = Array(24).fill(0);
        const hourlyCount = Array(24).fill(0);
        const cameraData = {};
        const congestionCounts = { low: 0, medium: 0, high: 0 };
        
        data.forEach(item => {
            // Process hourly data
            const hour = item.hour >= 0 && item.hour < 24 ? item.hour : 0;
            const vehicles = item.num_vehicles || 0;
            
            hourlyData[hour] += vehicles;
            hourlyCount[hour]++;
            
            // Process camera data
            const cameraId = item.camera_id.toString();
            if (!cameraData[cameraId]) cameraData[cameraId] = { total: 0, count: 0 };
            cameraData[cameraId].total += vehicles;
            cameraData[cameraId].count++;
            
            // Count congestion levels
            congestionCounts[item.congestion_level in congestionCounts ? item.congestion_level : 'low']++;
        });
        
        // Calculate averages
        const hourlyAvgs = hourlyData.map((total, idx) => hourlyCount[idx] > 0 ? total / hourlyCount[idx] : 0);
        const cameraAvgs = {};
        
        for (const [camera, data] of Object.entries(cameraData)) {
            cameraAvgs[camera] = data.count > 0 ? data.total / data.count : 0;
        }
        
        return { hourlyAvgs, cameraAvgs, congestionCounts };
    };
    
    // Calculate aggregates from filtered data
    const { hourlyAvgs, cameraAvgs, congestionCounts } = calculateAggregates(filteredData);
    
    // Get top cameras
    const topCameras = Object.entries(cameraAvgs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    // Update charts
    congestionChart.data.datasets[0].data = [
        congestionCounts.low,
        congestionCounts.medium,
        congestionCounts.high
    ];
    congestionChart.update();
    
    hourlyTrafficChart.data.datasets[0].data = hourlyAvgs;
    hourlyTrafficChart.update();
    
    if (topCameras.length > 0) {
        topCamerasChart.data.labels = topCameras.map(([camera]) => `Camera ${camera}`);
        topCamerasChart.data.datasets[0].data = topCameras.map(([_, avg]) => avg);
        topCamerasChart.update();
    }
    
    // Update map markers
    updateMapMarkers(cameraAvgs);
}

// Reset all filters
function resetFilters() {
    // Reset filter dropdowns
    document.getElementById('hourFilter').value = 'all';
    document.getElementById('congestionFilter').value = 'all';
    document.getElementById('cameraFilter').value = 'all';
    document.getElementById('dateFilter').value = 'all';
    
    // Reset data and UI
    filteredData = [...trafficData.data];
    currentPage = 1;
    displayImages(filteredData, currentPage);
    generatePagination(filteredData.length);
    
    // Reset daily summary
    document.getElementById('dailySummary').innerHTML = `
        <p class="text-muted text-center py-5">
            <i class="fas fa-chart-line fa-3x mb-3 d-block"></i>
            Select a date to view the daily summary
        </p>
    `;
    
    // Update charts with all data
    updateCharts();
}

// Generate daily summary
async function generateDailySummary() {
    const dateFilter = document.getElementById('dateFilter').value;
    const summaryContainer = document.getElementById('dailySummary');
    
    if (dateFilter === 'all') {
        summaryContainer.innerHTML = `
            <p class="text-muted text-center py-5">
                <i class="fas fa-chart-line fa-3x mb-3 d-block"></i>
                Select a date to view the daily summary
            </p>
        `;
        return;
    }
    
    // Show loading indicator
    summaryContainer.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2">Generating summary...</p>
        </div>
    `;
    
    try {
        // Check if we already have a summary for this date
        if (trafficData.daily_summaries?.[dateFilter]) {
            summaryContainer.innerHTML = `
                <div class="card border-0 bg-light">
                    <div class="card-body">
                        <h6 class="text-primary mb-3">Summary for ${dateFilter}</h6>
                        <p>${trafficData.daily_summaries[dateFilter]}</p>
                    </div>
                </div>
            `;
            return;
        }
        
        // Filter data for the selected date
        const dateData = trafficData.data.filter(item => item.date === dateFilter);
        
        // Calculate statistics
        const totalVehicles = dateData.reduce((sum, item) => sum + (item.num_vehicles || 0), 0);
        const avgVehicles = totalVehicles / (dateData.length || 1);
        
        // Count congestion levels
        const congestionCounts = { low: 0, medium: 0, high: 0 };
        dateData.forEach(item => {
            congestionCounts[item.congestion_level in congestionCounts ? item.congestion_level : 'low']++;
        });
        
        // Get hourly breakdown for the day
        const hourlyData = {};
        dateData.forEach(item => {
            const hour = item.hour;
            if (hour >= 0 && hour < 24) {
                if (!hourlyData[hour]) hourlyData[hour] = { vehicles: 0, count: 0 };
                hourlyData[hour].vehicles += (item.num_vehicles || 0);
                hourlyData[hour].count++;
            }
        });
        
        // Find peak hour
        let peakHour = 0, peakAvg = 0;
        for (const [hour, data] of Object.entries(hourlyData)) {
            const hourAvg = data.vehicles / data.count;
            if (hourAvg > peakAvg) {
                peakAvg = hourAvg;
                peakHour = hour;
            }
        }
        
        // Get captions for the day
        const captions = dateData.map(item => item.caption)
            .filter(caption => caption && caption !== 'No caption available');
        
        // Prepare data for summary generation
        const dailyStats = {
            date: dateFilter,
            totalImages: dateData.length,
            avgVehicles: avgVehicles.toFixed(1),
            peakHour: peakHour,
            peakVehicles: peakAvg.toFixed(1),
            congestion: congestionCounts
        };
        
        // Generate summary
        const summary = await generateDailySummaryWithLLM(captions, dailyStats);
        
        // Store for future use
        if (!trafficData.daily_summaries) trafficData.daily_summaries = {};
        trafficData.daily_summaries[dateFilter] = summary;
        
        // Display the summary
        summaryContainer.innerHTML = `
            <div class="card border-0 bg-light">
                <div class="card-body">
                    <h6 class="text-primary mb-3">Summary for ${dateFilter}</h6>
                    <p>${summary}</p>
                </div>
            </div>
            <div class="card border-0 bg-light mt-3">
                <div class="card-body">
                    <h6 class="text-primary mb-2">Daily Statistics</h6>
                    <div class="row text-center">
                        <div class="col-6">
                            <div class="border rounded p-2 mb-2">
                                <div class="small text-muted">Avg. Vehicles</div>
                                <div class="fs-5">${avgVehicles.toFixed(1)}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="border rounded p-2 mb-2">
                                <div class="small text-muted">Peak Hour</div>
                                <div class="fs-5">${peakHour}:00</div>
                            </div>
                        </div>
                    </div>
                    <div class="mt-2">
                        <div class="small text-muted mb-1">Congestion Levels:</div>
                        <div class="progress" style="height: 25px;">
                            <div class="progress-bar bg-success" style="width: ${congestionCounts.low / dateData.length * 100}%">
                                Low (${congestionCounts.low})
                            </div>
                            <div class="progress-bar bg-warning" style="width: ${congestionCounts.medium / dateData.length * 100}%">
                                Med (${congestionCounts.medium})
                            </div>
                            <div class="progress-bar bg-danger" style="width: ${congestionCounts.high / dateData.length * 100}%">
                                High (${congestionCounts.high})
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error generating summary:", error);
        summaryContainer.innerHTML = `
            <div class="alert alert-danger">
                Error generating summary: ${error.message}
            </div>
        `;
    }
}

// Generate daily summary with LLM API
async function generateDailySummaryWithLLM(captions, dailyStats) {
    try {
        // If no captions available, generate a general summary based on stats
        if (captions.length === 0) {
            return `Traffic on ${dailyStats.date} shows an average of ${dailyStats.avgVehicles} vehicles per image. Peak traffic was observed at ${dailyStats.peakHour}:00 with ${dailyStats.peakVehicles} vehicles on average. Overall congestion levels were predominantly ${getHighestCongestionLevel(dailyStats.congestion)}.`;
        }
        
        // Prepare the prompt with caption samples (max 5)
        const captionSamples = captions.slice(0, 5).join('\n');
        const prompt = `Generate a concise summary of traffic conditions for ${dailyStats.date} based on these traffic camera captions and statistics:

Caption samples:
${captionSamples}

Statistics:
- Average vehicles per image: ${dailyStats.avgVehicles}
- Peak hour: ${dailyStats.peakHour}:00 with ${dailyStats.peakVehicles} vehicles on average
- Congestion levels: Low (${dailyStats.congestion.low}), Medium (${dailyStats.congestion.medium}), High (${dailyStats.congestion.high})

Provide a 2-3 sentence summary highlighting key traffic patterns, congestion levels, and any notable observations. Focus on practical insights for traffic management.`;
        
        // Call the LLM API
        const response = await fetch('https://llmfoundry.straive.com/gemini/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: "include",
            body: JSON.stringify({
                model: 'gemini-2.0-flash',
                messages: [
                    { role: 'system', content: 'You are a traffic analysis assistant that provides concise, factual summaries of daily traffic conditions.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 150
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate summary');
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("Error calling LLM API for daily summary:", error);
        return `Traffic on ${dailyStats.date} shows an average of ${dailyStats.avgVehicles} vehicles per image. Peak traffic was observed at ${dailyStats.peakHour}:00 with ${dailyStats.peakVehicles} vehicles on average. Overall congestion levels were predominantly ${getHighestCongestionLevel(dailyStats.congestion)}.`;
    }
}

// Helper function to get the highest congestion level
function getHighestCongestionLevel(congestionCounts) {
    return congestionCounts.high > congestionCounts.medium && congestionCounts.high > congestionCounts.low ? 'high' :
           congestionCounts.medium > congestionCounts.low ? 'medium' : 'low';
}

// Compare vehicle detection between COCO-SSD and Gemini-2.5-Flash
async function compareDetectionModels() {
    const modalImage = document.getElementById('modalImage');
    const modalAnalysisContent = document.getElementById('modalAnalysisContent');
    const analysisProgress = document.getElementById('analysisProgress');
    
    // Show progress bar
    analysisProgress.classList.remove('d-none');
    analysisProgress.querySelector('.progress-bar').style.width = '20%';
    
    try {
        // Handle image loading
        if (!modalImage.complete || modalImage.naturalWidth === 0) {
            await new Promise((resolve, reject) => {
                modalImage.onload = resolve;
                modalImage.onerror = () => reject(new Error("Failed to load image"));
                setTimeout(() => reject(new Error("Image load timeout")), 5000);
            });
        }
        
        analysisProgress.querySelector('.progress-bar').style.width = '30%';
        
        // Step 1: Get image URL for Gemini
        const imageUrl = modalImage.src;
        
        // Step 2: Run COCO-SSD detection
        const cocoResult = await detectVehicles(modalImage);
        
        analysisProgress.querySelector('.progress-bar').style.width = '60%';
        
        // Step 3: Run Gemini detection
        const geminiResult = await detectVehiclesWithGemini(imageUrl);
        
        analysisProgress.querySelector('.progress-bar').style.width = '90%';
        
        // Step 4: Compare results
        const comparisonHtml = generateComparisonHtml(cocoResult, geminiResult);
        
        // Switch to the analysis tab
        document.getElementById('analysis-tab').click();
        
        // Display the comparison
        modalAnalysisContent.innerHTML = comparisonHtml;
        
        // Complete progress
        analysisProgress.querySelector('.progress-bar').style.width = '100%';
        setTimeout(() => analysisProgress.classList.add('d-none'), 1000);
    } catch (error) {
        console.error("Error comparing detection models:", error);
        modalAnalysisContent.innerHTML = `
            <div class="alert alert-danger">
                <strong>Error comparing models:</strong> ${error.message}
            </div>
        `;
        
        // Show error in progress
        analysisProgress.querySelector('.progress-bar').style.width = '100%';
        analysisProgress.querySelector('.progress-bar').classList.remove('bg-success');
        analysisProgress.querySelector('.progress-bar').classList.add('bg-danger');
        setTimeout(() => analysisProgress.classList.add('d-none'), 1000);
    }
}

// Detect vehicles using Gemini multimodal model
async function detectVehiclesWithGemini(imageUrl) {
    try {
        // Get the image element to ensure we have a valid image
        const modalImage = document.getElementById('modalImage');
        let imageBase64;
        
        try {
            // Try to get image data directly from the modal image element
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set dimensions
            canvas.width = modalImage.naturalWidth || 640;
            canvas.height = modalImage.naturalHeight || 480;
            
            // Draw image to canvas
            ctx.drawImage(modalImage, 0, 0, canvas.width, canvas.height);
            
            // Get base64 data
            imageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
            
            // Verify we have valid base64 data
            if (!imageBase64 || imageBase64.length < 100) {
                throw new Error("Generated base64 data too small, likely invalid");
            }
        } catch (canvasError) {
            console.error("Error converting image to base64:", canvasError);
            
            if (imageUrl.startsWith('http')) {
                // Try fetching the image with a proxy (if needed)
                try {
                    // Create a proxy URL for CORS issues
                    const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
                    const response = await fetch(proxyUrl + imageUrl, {
                        mode: 'cors',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed to fetch image: ${response.status}`);
                    }
                    
                    const blob = await response.blob();
                    
                    imageBase64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (fetchError) {
                    console.error("Error fetching image via proxy:", fetchError);
                    throw new Error("Could not retrieve image data. CORS or network issues.");
                }
            } else {
                throw new Error("Could not convert image to required format.");
            }
        }
        
        // Make API call to Gemini
        const response = await fetch('https://llmfoundry.straive.com/gemini/v1beta/models/gemini-2.0-flash:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: "include",
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: "Analyze this traffic camera image and list each vehicle type and their respective count using the following keywords only: car, truck, bus, motorcycle, bicycle. Also provide the total number of vehicles. End with a congestion level (low, medium, or high). Format example: 'There are 5 cars, 2 trucks, and 1 bus. Total 8 vehicles. Congestion level: Medium.'"
                            },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: imageBase64
                                }
                            }
                        ]
                    }
                ]
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API error: ${errorData.error?.message || response.status}`);
        }
        
        const data = await response.json();
        
        // Extract text from response
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Parse response to extract vehicle count and congestion level
        const vehicleCount = extractVehicleCount(responseText);
        const congestionLevel = extractCongestionLevel(responseText);
        const vehicleTypes = extractVehicleTypes(responseText);
        
        return {
            vehicleCount,
            congestionLevel,
            responseText,
            detections: vehicleTypes.map(vt => ({ class: vt.type, count: vt.count }))
        };
    } catch (error) {
        console.error("Error in Gemini detection:", error);
        return {
            vehicleCount: 0,
            congestionLevel: 'unknown',
            responseText: `Error: ${error.message}`,
            detections: []
        };
    }
}

// Helper functions to parse Gemini response
function extractVehicleCount(text) {
    // Try to find a total count pattern
    const totalPattern = /total\s*[^\d]*(\d+)/i;
    const countPattern = /(\d+)\s*vehicles?/i;
    const numbersPattern = /(\d+)\s*(car|truck|bus|motorcycle|bicycle)/gi;
    
    let match = text.match(totalPattern);
    if (match) return parseInt(match[1]);
    
    match = text.match(countPattern);
    if (match) return parseInt(match[1]);
    
    // Sum all vehicle mentions
    let total = 0;
    let matches;
    while ((matches = numbersPattern.exec(text)) !== null) {
        total += parseInt(matches[1]);
    }
    
    return total || 0;
}

function extractCongestionLevel(text) {
    if (text.match(/high\s*congestion/i)) return 'high';
    if (text.match(/medium\s*congestion/i)) return 'medium';
    if (text.match(/low\s*congestion/i)) return 'low';
    
    // Look for congestion assessment
    if (text.match(/congestion\s*:?\s*high/i)) return 'high';
    if (text.match(/congestion\s*:?\s*medium/i)) return 'medium';
    if (text.match(/congestion\s*:?\s*low/i)) return 'low';
    
    return 'unknown';
}

// Helper function to generate Gemini vehicle list
function generateGeminiVehicleList(detections) {
    if (!detections || detections.length === 0) {
        return '<li class="list-group-item border-0 py-1 px-2 text-danger">No vehicles detected</li>';
    }
    
    // Display in a consistent format
    return detections.map(d => {
        const vehicleType = d.type || d.class || 'Unknown';
        const count = d.count || 1;
        
        return `
            <li class="list-group-item border-0 d-flex justify-content-between align-items-center py-1 px-2">
                ${vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1)}
                <span class="badge bg-primary rounded-pill">${count}</span>
            </li>
        `;
    }).join('');
}

// Function to extract vehicle types from Gemini's text response
function extractVehicleTypes(text) {
    if (!text || text.startsWith('Error:')) {
        return [];
    }
    
    const vehicleTypes = [];
    const patterns = [
        { type: 'car', regex: /(\d+)\s*cars?/i },
        { type: 'truck', regex: /(\d+)\s*trucks?/i },
        { type: 'bus', regex: /(\d+)\s*bus(?:es)?/i },
        { type: 'motorcycle', regex: /(\d+)\s*motorcycles?/i },
        { type: 'bicycle', regex: /(\d+)\s*bicycles?/i },
        { type: 'van', regex: /(\d+)\s*vans?/i },
        { type: 'taxi', regex: /(\d+)\s*taxis?/i },
        { type: 'suv', regex: /(\d+)\s*suvs?/i }
    ];
    
    patterns.forEach(pattern => {
        const match = text.match(pattern.regex);
        if (match) {
            vehicleTypes.push({
                type: pattern.type,
                count: parseInt(match[1])
            });
        }
    });
    
    // If no vehicles found but there's a total count, add as "unspecified"
    if (vehicleTypes.length === 0) {
        const totalCount = extractVehicleCount(text);
        if (totalCount > 0) {
            vehicleTypes.push({
                type: 'unspecified',
                count: totalCount
            });
        }
    }
    
    return vehicleTypes;
}

// Generate comparison HTML
function generateComparisonHtml(cocoResult, geminiResult) {
    // Generate HTML for vehicle detection methods
    const cocoBadgeClass = cocoResult.vehicleCount > 0 ? 'bg-success' : 'bg-secondary';
    const geminiBadgeClass = geminiResult.vehicleCount > 0 ? 'bg-success' : 'bg-secondary';
    
    // Handle missing congestion level
    const cocoLevel = cocoResult.congestionLevel ? cocoResult.congestionLevel.toUpperCase() : 'UNKNOWN';
    const geminiLevel = geminiResult.congestionLevel ? geminiResult.congestionLevel.toUpperCase() : 'UNKNOWN';
    
    // Create the difference and match/mismatch badges
    const diffBadge = `<span class="badge ${Math.abs(cocoResult.vehicleCount - geminiResult.vehicleCount) > 2 ? 'bg-warning text-dark' : 'bg-success'}">Diff: ${Math.abs(cocoResult.vehicleCount - geminiResult.vehicleCount)}</span>`;
    
    const matchBadge = cocoResult.congestionLevel === geminiResult.congestionLevel 
        ? '<span class="badge bg-success">Match</span>' 
        : '<span class="badge bg-warning text-dark">Mismatch</span>';
    
    // Generate error message if any
    const geminiErrorMessage = geminiResult.responseText.startsWith('Error:') 
        ? `<div class="alert alert-danger mt-2 p-2">${geminiResult.responseText}</div>` 
        : '';
    
    return `
        <div class="h-100 d-flex flex-column">
            <h5 class="text-center py-2 mb-3 border-bottom bg-light">Model Comparison Results</h5>
            
            <div class="row flex-grow-1 g-3 mb-3">
                <!-- COCO-SSD Column -->
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header bg-primary text-white py-2">
                            <h5 class="mb-0">COCO-SSD (TensorFlow.js)</h5>
                        </div>
                        <div class="card-body">
                            <div class="mb-3 d-flex justify-content-between align-items-center">
                                <h6 class="mb-0">Vehicle Count:</h6>
                                <span class="badge ${cocoBadgeClass} rounded-pill fs-6">${cocoResult.vehicleCount}</span>
                            </div>
                            <div class="mb-3 d-flex justify-content-between align-items-center">
                                <h6 class="mb-0">Congestion Level:</h6>
                                <span class="badge ${getTrafficBadgeClass(cocoLevel)} fs-6">${cocoLevel}</span>
                            </div>
                            <div>
                                <h6 class="mb-2">Vehicle Types:</h6>
                                <div class="p-2 border rounded bg-light">
                                    ${cocoResult.detections && cocoResult.detections.length > 0 
                                        ? generateVehicleTypeList(cocoResult.detections)
                                        : '<div class="text-danger">No vehicles detected</div>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Gemini Column -->
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header bg-success text-white py-2">
                            <h5 class="mb-0">Gemini 2.0 Flash</h5>
                        </div>
                        <div class="card-body">
                            <div class="mb-3 d-flex justify-content-between align-items-center">
                                <h6 class="mb-0">Vehicle Count:</h6>
                                <span class="badge ${geminiBadgeClass} rounded-pill fs-6">${geminiResult.vehicleCount}</span>
                            </div>
                            <div class="mb-3 d-flex justify-content-between align-items-center">
                                <h6 class="mb-0">Congestion Level:</h6>
                                <span class="badge ${getTrafficBadgeClass(geminiLevel)} fs-6">${geminiLevel}</span>
                            </div>
                            <div class="mb-3">
                                <h6 class="mb-2">Vehicle Types:</h6>
                                <div class="p-2 border rounded bg-light">
                                    ${geminiResult.detections && geminiResult.detections.length > 0 
                                        ? generateSimpleVehicleList(geminiResult.detections)
                                        : '<div class="text-danger">No vehicles detected</div>'}
                                </div>
                            </div>
                            ${geminiErrorMessage}
                            
                            ${!geminiResult.responseText.startsWith('Error:') ? `
                            <div>
                                <h6 class="mb-2">Gemini Response:</h6>
                                <div class="border rounded p-2 overflow-auto bg-light" style="max-height: 150px;">
                                    ${geminiResult.responseText.replace(/\n/g, '<br>')}
                                </div>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Analysis Summary -->
            <div class="card mt-auto">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Analysis Summary</h5>
                </div>
                <div class="card-body">
                    <div class="d-flex align-items-center mb-3">
                        <div class="me-3"><h6 class="mb-0">Vehicle Count Difference:</h6></div>
                        <div class="me-1">${diffBadge}</div>
                    </div>
                    <div class="d-flex align-items-center mb-3">
                        <div class="me-3"><h6 class="mb-0">Congestion Assessment:</h6></div>
                        <div>${matchBadge}</div>
                    </div>
                    <div class="alert alert-info mb-0">
                        <strong>About the Models:</strong> COCO-SSD uses TensorFlow's machine learning object detection with predefined vehicle classes, while 
                        Gemini uses advanced multimodal vision-language processing to analyze the image context and identify vehicles.
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Generate a simple list of vehicle types with badges
function generateSimpleVehicleList(detections) {
    if (!detections || detections.length === 0) {
        return '<div class="text-danger">No vehicles detected</div>';
    }
    
    let html = '<div class="d-flex flex-wrap gap-2">';
    
    detections.forEach(d => {
        const type = d.type || d.class || 'Unknown';
        const count = d.count || 1;
        
        html += `<div class="badge bg-light text-dark border fs-6">${type.charAt(0).toUpperCase() + type.slice(1)} <span class="badge bg-primary rounded-pill">${count}</span></div>`;
    });
    
    html += '</div>';
    return html;
}

// Generate vehicle type list HTML for COCO-SSD detections
function generateVehicleTypeList(detections) {
    if (!detections || detections.length === 0) {
        return '<div class="text-danger">No vehicles detected</div>';
    }
    
    // Count each vehicle type
    const typeCounts = {};
    detections.forEach(d => {
        typeCounts[d.class] = (typeCounts[d.class] || 0) + 1;
    });
    
    // Generate badges for each vehicle type
    let html = '<div class="d-flex flex-wrap gap-2">';
    
    Object.entries(typeCounts).forEach(([type, count]) => {
        html += `<div class="badge bg-light text-dark border fs-6">${type.charAt(0).toUpperCase() + type.slice(1)} <span class="badge bg-primary rounded-pill">${count}</span></div>`;
    });
    
    html += '</div>';
    return html;
}

// Helper function to get badge class based on traffic level
function getTrafficBadgeClass(level) {
    switch(level.toUpperCase()) {
        case 'HIGH': return 'bg-danger';
        case 'MEDIUM': return 'bg-warning text-dark';
        case 'LOW': return 'bg-success';
        default: return 'bg-secondary';
    }
}
