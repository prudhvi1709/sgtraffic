# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "pandas"
# ]
# ///
import os
import re
import pandas as pd
from datetime import datetime
import calendar

def parse_traffic_images(directory_path):
    """
    Parse traffic image filenames to extract metadata and organize into a pandas DataFrame.
    
    Filename format: DATE_CAMERAID_DATETIME.jpg
    Example: 2025-04-28_6711_2025-04-28T16-40-36+08-00.jpg
    
    Returns a DataFrame with the following columns:
    - filename: original filename
    - camera_id: extracted camera ID
    - datetime: parsed datetime object
    - hour: hour of the day (0-23)
    - weekday: day of the week (Monday, Tuesday, etc.)
    - path: full path to the image file
    """
    # Initialize an empty list to store dictionaries for each file
    data = []
    
    # Pattern to match the filename format
    pattern = r'(\d{4}-\d{2}-\d{2})_(\d+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\+\d{2}-\d{2})\.jpg'
    
    # Walk through the directory
    for root, _, files in os.walk(directory_path):
        for filename in files:
            if filename.endswith('.jpg'):
                match = re.match(pattern, filename)
                if match:
                    date_str, camera_id, datetime_str = match.groups()
                    
                    # Convert datetime string to Python datetime object
                    # Format: 2025-04-28T16-40-36+08-00
                    datetime_str = datetime_str.replace('-', ':')
                    datetime_obj = datetime.strptime(
                        datetime_str.replace('T', ' ').split('+')[0], 
                        '%Y:%m:%d %H:%M:%S'
                    )
                    
                    # Extract hour
                    hour = datetime_obj.hour
                    
                    # Get weekday name
                    weekday = calendar.day_name[datetime_obj.weekday()]
                    
                    # Store the data
                    data.append({
                        'filename': filename,
                        'camera_id': int(camera_id),
                        'datetime': datetime_obj,
                        'date': datetime_obj.date(),
                        'hour': hour,
                        'weekday': weekday,
                        'path': os.path.join(root, filename)
                    })
    
    # Create DataFrame
    df = pd.DataFrame(data)
    
    return df

if __name__ == "__main__":
    # Parse traffic images and create DataFrame
    traffic_df = parse_traffic_images('traffic_images')
    
    # Display basic statistics
    print(f"Total images processed: {len(traffic_df)}")
    print("\nSample data:")
    print(traffic_df.head())
    
    # Display distribution of images by camera_id
    print("\nImages per camera:")
    print(traffic_df['camera_id'].value_counts().head(10))
    
    # Display distribution of images by hour
    print("\nImages per hour:")
    print(traffic_df['hour'].value_counts().sort_index())
    
    # Display distribution of images by weekday
    print("\nImages per weekday:")
    print(traffic_df['weekday'].value_counts())
    
    # Save DataFrame to CSV
    traffic_df.to_csv('traffic_images_metadata.csv', index=False)
    print("\nMetadata saved to 'traffic_images_metadata.csv'") 