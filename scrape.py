# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "aiohttp",
#     "pandas",
#     "python-dotenv",
#     "pytz"
# ]
# ///
import asyncio
import aiohttp
import time
import os
from datetime import datetime, timedelta
import logging
from concurrent.futures import ProcessPoolExecutor
from functools import partial
import hashlib

# Constants
API_ENDPOINT = "https://api.data.gov.sg/v1/transport/traffic-images"
SAVE_DIR = "traffic_images"
TARGET_IMAGE_COUNT = 10000
MAX_CONCURRENT_DOWNLOADS = 50
WORKER_PROCESSES = 20
MAX_RETRIES = 3

# Historical data collection settings
DAYS_TO_FETCH = 7  # Collect data from the past week
HOURS_PER_DAY = 24  # Collect from all hours in a day
MINUTES_PER_HOUR = [0, 15, 30, 45]  # Collect at 15-minute intervals
REQUEST_DELAY = 0.1  # Small delay between API requests (seconds)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create directory to save images if it doesn't exist
os.makedirs(SAVE_DIR, exist_ok=True)

# Track collected image metadata to avoid exact duplicates
collected_hashes = set()  # Store image content hashes to avoid saving identical images
collected_filenames = set()  # Track filenames to avoid overwriting

async def fetch_traffic_images(session, target_datetime, retry_count=0):
    """
    Fetches traffic images from the API for a specific datetime.
    """
    try:
        params = {
            "date_time": target_datetime.strftime("%Y-%m-%dT%H:%M:%S")
        }
        
        async with session.get(API_ENDPOINT, params=params, timeout=10) as response:
            if response.status == 200:
                data = await response.json()
                return data.get("items", [])
            else:
                logger.error(f"API returned status code {response.status} for {target_datetime}")
                if retry_count < MAX_RETRIES:
                    logger.info(f"Retrying fetch (attempt {retry_count+1}/{MAX_RETRIES})...")
                    await asyncio.sleep(1)
                    return await fetch_traffic_images(session, target_datetime, retry_count + 1)
                return []
    except asyncio.TimeoutError:
        logger.error(f"API request timed out for {target_datetime}")
        if retry_count < MAX_RETRIES:
            logger.info(f"Retrying fetch after timeout (attempt {retry_count+1}/{MAX_RETRIES})...")
            await asyncio.sleep(1)
            return await fetch_traffic_images(session, target_datetime, retry_count + 1)
        return []
    except Exception as e:
        logger.error(f"Error fetching data for {target_datetime}: {e}")
        if retry_count < MAX_RETRIES:
            logger.info(f"Retrying fetch (attempt {retry_count+1}/{MAX_RETRIES})...")
            await asyncio.sleep(1)
            return await fetch_traffic_images(session, target_datetime, retry_count + 1)
        return []

def compute_image_hash(image_data):
    """
    Compute a hash of the image data to detect duplicates.
    """
    return hashlib.md5(image_data).hexdigest()

def save_image_to_disk(image_data, camera_id, timestamp, day_str):
    """
    Saves downloaded image data to disk (run in process pool).
    """
    try:
        # Filename format: day_cameraId_timestamp.jpg
        filename = f"{day_str}_{camera_id}_{timestamp.replace(':', '-')}.jpg"
        
        # Skip if we already have this exact filename
        if filename in collected_filenames:
            return None
            
        filepath = os.path.join(SAVE_DIR, filename)
        
        with open(filepath, 'wb') as f:
            f.write(image_data)
        
        collected_filenames.add(filename)
        return filename
    except Exception as e:
        logger.error(f"Failed to save image for camera {camera_id}: {e}")
        return None

async def download_image(session, image_url, camera_id, timestamp, target_datetime, executor):
    """
    Downloads an image and saves it using the process pool.
    """
    try:
        async with session.get(image_url, timeout=5) as response:
            if response.status == 200:
                image_data = await response.read()
                
                # Compute hash to check for identical images
                img_hash = compute_image_hash(image_data)
                if img_hash in collected_hashes:
                    return None
                
                # Format day string for folder organization
                day_str = target_datetime.strftime("%Y-%m-%d")
                
                # Use process pool to save the image
                filename = await asyncio.get_event_loop().run_in_executor(
                    executor, 
                    partial(save_image_to_disk, image_data, camera_id, timestamp, day_str)
                )
                
                if filename:
                    collected_hashes.add(img_hash)
                    logger.info(f"Saved: {filename}")
                    return image_url
                
            else:
                logger.error(f"Failed to download image {image_url}: HTTP {response.status}")
                return None
    except asyncio.TimeoutError:
        logger.error(f"Timeout downloading image {image_url}")
        return None
    except Exception as e:
        logger.error(f"Error downloading {image_url}: {e}")
        return None

async def process_camera_batch(session, cameras, target_datetime, executor):
    """
    Process a batch of cameras concurrently with rate limiting.
    """
    tasks = []
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_DOWNLOADS)
    
    async def download_with_semaphore(image_url, camera_id, timestamp):
        async with semaphore:
            return await download_image(session, image_url, camera_id, timestamp, target_datetime, executor)
    
    for camera in cameras:
        image_url = camera.get("image")
        camera_id = camera.get("camera_id")
        timestamp = camera.get("timestamp")
        
        if image_url and camera_id and timestamp:
            task = asyncio.create_task(
                download_with_semaphore(image_url, camera_id, timestamp)
            )
            tasks.append(task)
    
    if not tasks:
        return 0
        
    results = await asyncio.gather(*tasks)
    # Count successful downloads (non-None results)
    return sum(1 for result in results if result is not None)

async def generate_time_points():
    """
    Generate a list of datetime points to fetch from the past week.
    """
    time_points = []
    now = datetime.now()
    
    for days_ago in range(DAYS_TO_FETCH):
        target_date = now - timedelta(days=days_ago)
        
        for hour in range(HOURS_PER_DAY):
            for minute in MINUTES_PER_HOUR:
                time_point = target_date.replace(
                    hour=hour, 
                    minute=minute,
                    second=0, 
                    microsecond=0
                )
                time_points.append(time_point)
    
    # Sort from most recent to oldest
    time_points.sort(reverse=True)
    return time_points

async def main_async():
    """
    Main async function to collect historical traffic images.
    """
    # Create a process pool for disk I/O operations
    with ProcessPoolExecutor(max_workers=WORKER_PROCESSES) as executor:
        # Create a shared session for all requests with a timeout
        timeout = aiohttp.ClientTimeout(total=15)
        connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT_DOWNLOADS)
        
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            start_time = time.time()
            
            # Generate time points to fetch
            time_points = await generate_time_points()
            total_time_points = len(time_points)
            logger.info(f"Generated {total_time_points} time points to fetch over the past {DAYS_TO_FETCH} days")
            
            for i, target_datetime in enumerate(time_points):
                # Stop if we've reached our target
                if len(collected_hashes) >= TARGET_IMAGE_COUNT:
                    break
                    
                # Progress indicator
                logger.info(f"Processing time point {i+1}/{total_time_points}: {target_datetime} - {len(collected_hashes)} images collected")
                
                # Fetch images for this time point
                items = await fetch_traffic_images(session, target_datetime)
                
                if items:
                    all_cameras = []
                    for item in items:
                        all_cameras.extend(item.get("cameras", []))
                    
                    # Process cameras for this time point
                    new_images = await process_camera_batch(session, all_cameras, target_datetime, executor)
                    
                    if new_images > 0:
                        logger.info(f"Added {new_images} new images from {target_datetime}")
                    
                    # Brief stats update on progress
                    total_images = len(collected_hashes)
                    elapsed_time = time.time() - start_time
                    rate = total_images / elapsed_time if elapsed_time > 0 else 0
                    logger.info(f"Total progress: {total_images} images ({rate:.2f} images/sec)")
                
                # Small delay to avoid overwhelming the API
                await asyncio.sleep(REQUEST_DELAY)
            
            # Final stats
            total_images = len(collected_hashes)
            elapsed_time = time.time() - start_time
            logger.info(f"Collection completed with {total_images} images in {elapsed_time:.2f} seconds")
            
            if total_images < TARGET_IMAGE_COUNT:
                logger.warning(f"Only collected {total_images} images, which is less than the target of {TARGET_IMAGE_COUNT}")
                logger.warning("You may need to increase DAYS_TO_FETCH or add more time points per day")

def main():
    logger.info(f"Starting historical traffic image collection for the past {DAYS_TO_FETCH} days...")
    start_time = time.time()
    
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        logger.info("Collection stopped by user.")
    finally:
        total_time = time.time() - start_time
        total_images = len(collected_hashes)
        logger.info(f"Collection completed in {total_time:.2f} seconds. Total images: {total_images}")
        logger.info(f"Average rate: {total_images/total_time:.2f} images per second")

if __name__ == "__main__":
    main() 