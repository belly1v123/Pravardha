# Pravardha ESP32 Firmware

## Hardware Requirements

### Components
- ESP32 development board (e.g., ESP32-DevKitC)
- DHT11 temperature and humidity sensor
- BMP180 barometric pressure sensor
- MQ135 air quality sensor
- Breadboard and jumper wires
- Micro USB cable

### Pin Connections

#### DHT11
```
DHT11 Pin → ESP32 Pin
VCC       → 3.3V
GND       → GND
DATA      → GPIO4
```

#### BMP180 (I2C)
```
BMP180 Pin → ESP32 Pin
VCC        → 3.3V
GND        → GND
SDA        → GPIO21 (default I2C SDA)
SCL        → GPIO22 (default I2C SCL)
```

#### MQ135
```
MQ135 Pin → ESP32 Pin
VCC       → 5V (needs 5V for heater)
GND       → GND
AOUT      → GPIO34 (ADC1_CH6)
```

**Important**: The MQ135 needs 48 hours of burn-in time for accurate readings. For the hackathon, raw ADC values are acceptable.

### Wiring Diagram

```
                   ESP32
                 ┌────────┐
                 │        │
    DHT11 DATA ──┤ GPIO4  │
                 │        │
    BMP180 SDA ──┤ GPIO21 │
    BMP180 SCL ──┤ GPIO22 │
                 │        │
    MQ135 AOUT ──┤ GPIO34 │
                 │        │
    3.3V ────────┤ 3V3    │──── DHT11 VCC, BMP180 VCC
    5V ──────────┤ VIN    │──── MQ135 VCC
    GND ─────────┤ GND    │──── All sensor GND
                 └────────┘
```

## Software Setup

### Arduino IDE Configuration

1. **Install Arduino IDE**
   - Download from [arduino.cc](https://www.arduino.cc/en/software)
   - Install version 2.0 or later

2. **Add ESP32 Board Support**
   - Open Arduino IDE
   - Go to: File → Preferences
   - Add to "Additional Board Manager URLs":
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to: Tools → Board → Boards Manager
   - Search "ESP32" and install "esp32 by Espressif Systems"

3. **Install Required Libraries**
   - Go to: Tools → Manage Libraries
   - Install the following:
     - **DHT sensor library** by Adafruit (includes Adafruit Unified Sensor)
     - **Adafruit BMP085 Library** by Adafruit
     - **ArduinoJson** by Benoit Blanchon (v6.x)

### Configuration

1. **Open the sketch**
   ```
   firmware/pravardha_esp32.ino
   ```

2. **Update configuration section** (lines 27-42):

   ```cpp
   // WiFi credentials
   #define WIFI_SSID "YourWiFiSSID"
   #define WIFI_PASSWORD "YourWiFiPassword"

   // Device authentication (from seed_device.ts output)
   #define DEVICE_ID "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   #define DEVICE_KEY "your-device-key-from-seed-script"

   // Supabase Edge Function URL
   #define INGEST_URL "https://your-project.supabase.co/functions/v1/ingest"
   ```

3. **Get Device ID and Key**
   ```bash
   cd scripts
   npx tsx seed_device.ts
   ```
   
   Copy the output values to the firmware configuration.

### Flashing the Firmware

1. **Select Board**
   - Tools → Board → ESP32 Arduino → ESP32 Dev Module

2. **Configure Board Settings**
   - Upload Speed: 921600
   - CPU Frequency: 240MHz
   - Flash Frequency: 80MHz
   - Flash Mode: QIO
   - Flash Size: 4MB
   - Partition Scheme: Default 4MB with spiffs
   - Core Debug Level: None (or Info for debugging)
   - Port: Select your ESP32 COM port

3. **Upload**
   - Click the "Upload" button (→)
   - Wait for compilation and upload to complete
   - If upload fails, try holding the BOOT button on ESP32 during upload

### Testing

1. **Open Serial Monitor**
   - Tools → Serial Monitor
   - Set baud rate to **115200**

2. **Expected Output**
   ```
   =================================
   Pravardha ESP32 IoT Sensor Node
   =================================

   ✓ DHT11 initialized
   ✓ BMP180 initialized
   ✓ MQ135 ADC initialized

   Connecting to WiFi: YourWiFiSSID
   ...
   ✓ WiFi connected
     IP address: 192.168.1.xxx
     Signal strength: -45 dBm

   Syncing time with NTP server... ✓
     Current time: 2025-10-21 14:30:45

   ✓ Setup complete. Starting sensor loop...

   --- Sampling Sensors ---
   Temperature: 23.5 °C
   Humidity: 65.2 %
   Pressure: 1013.25 hPa
   MQ135 ADC: 2048
   Accumulated samples: 1 / 4

   [... more samples ...]

   === Posting Data to Supabase ===
   Averaged 4 samples:
     Temp: 23.6
     Humidity: 65.0
     Pressure: 1013.30
     MQ135: 2050
   Payload: {"ts_ms":1729517445000,"temperature":23.6,"humidity":65.0,"pressure":1013.30,"mq135_adc":2050}
   HTTP Response: 200
   Response body: {"ok":true,"reading_id":"xxx-xxx-xxx"}
   ✓ Data posted successfully
   ```

## Troubleshooting

### WiFi Connection Issues

**Symptom**: `✗ WiFi connection failed!`

**Solutions**:
- Verify SSID and password are correct
- Ensure using 2.4GHz WiFi (ESP32 doesn't support 5GHz)
- Check router firewall settings
- Try moving ESP32 closer to router
- Restart ESP32 (press RST button)

### Sensor Read Failures

**DHT11**: `✗ DHT11 read failed`
- Check wiring (especially data pin to GPIO4)
- Verify 3.3V power supply
- Try adding a 10kΩ pull-up resistor between DATA and VCC
- Wait 2 seconds after power-on for sensor to stabilize

**BMP180**: `✗ BMP180 not found!`
- Check I2C wiring (SDA to GPIO21, SCL to GPIO22)
- Verify 3.3V power supply
- Use an I2C scanner sketch to detect address (should be 0x77)
- Ensure no I2C address conflicts

**MQ135**: Low or erratic readings
- Ensure 5V power supply (heater requires 5V)
- Allow 48-hour burn-in period for calibration
- Check ADC pin connection (GPIO34)
- For hackathon, raw ADC values are fine (0-4095)

### HTTP POST Failures

**Symptom**: `✗ HTTP POST failed: connection refused`

**Solutions**:
- Verify `INGEST_URL` is correct
- Check device exists in Supabase `devices` table
- Verify device key matches (run seed script again if needed)
- Test endpoint with curl first
- Check firewall/antivirus blocking HTTPS
- Ensure Supabase Edge Function is deployed

**Symptom**: `HTTP Response: 401` (Unauthorized)

**Solutions**:
- Device ID or key incorrect
- Run `seed_device.ts` again and update firmware
- Check device_keys table has correct hash

**Symptom**: `HTTP Response: 500` (Server Error)

**Solutions**:
- Check Supabase Edge Function logs:
  ```bash
  supabase functions logs ingest
  ```
- Verify service role key is set correctly
- Check database RLS policies

### Upload Issues

**Symptom**: `A fatal error occurred: Failed to connect to ESP32`

**Solutions**:
- Hold BOOT button during upload
- Check USB cable (use data cable, not charge-only)
- Install CH340/CP2102 USB driver if needed
- Try different USB port
- Reduce upload speed to 115200

### Time Sync Issues

**Symptom**: `✗ Failed to sync time`

**Solutions**:
- Check internet connectivity
- Verify NTP server is reachable
- Try different NTP server (e.g., `time.google.com`)
- Adjust GMT offset if in different timezone

## Power Optimization (Future)

For battery-powered deployment:
- Use deep sleep between readings
- Reduce POST frequency
- Disable WiFi between transmissions
- Use lower CPU frequency (80MHz)

Example deep sleep modification:
```cpp
#define SLEEP_TIME_SECONDS 300  // 5 minutes

void loop() {
  sampleSensors();
  postData();
  
  Serial.println("Entering deep sleep for 5 minutes...");
  esp_sleep_enable_timer_wakeup(SLEEP_TIME_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}
```

## Sensor Calibration (Production)

### MQ135 CO2 Calibration
For production, calibrate MQ135 in clean air:
1. Power on for 48 hours
2. Note ADC value in clean air (R0)
3. Use datasheet formulas to convert ADC → PPM
4. Store calibration constants in EEPROM

### BMP180 Altitude Compensation
If monitoring at altitude:
```cpp
float altitude = 100.0; // meters
float seaLevelPressure = bmp.readSealevelPressure(altitude) / 100.0;
```

## Next Steps

Once firmware is running:
1. Check Serial Monitor for successful POSTs
2. Verify data in Supabase `readings` table
3. Open web dashboard to see live data
4. Proceed to Phase 2 (aggregation)

## Support

For firmware issues:
- Check Serial Monitor output
- Test sensors individually with example sketches
- Verify wiring with multimeter
- See main README.md troubleshooting section
