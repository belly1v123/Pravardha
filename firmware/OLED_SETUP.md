# OLED Display Integration for Pravardha ESP32

## Hardware: 0.96" SSD1306 OLED Display

### Specifications
- **Resolution**: 128x64 pixels
- **Interface**: I2C
- **I2C Address**: 0x3C (default)
- **Voltage**: 3.3V - 5V

## Wiring Connections

| OLED Pin | ESP32 Pin | Description |
|----------|-----------|-------------|
| VCC | 3.3V | Power supply |
| GND | GND | Ground |
| SCL | GPIO 22 | I2C Clock (shared with BMP180) |
| SDA | GPIO 21 | I2C Data (shared with BMP180) |

**Note**: The OLED shares the I2C bus with the BMP180 sensor. Both use the same SDA/SCL pins.

## Required Libraries

Install these libraries via Arduino IDE Library Manager:

1. **Adafruit GFX Library** by Adafruit
   - Provides graphics primitives (text, lines, shapes)
   - Required dependency for SSD1306

2. **Adafruit SSD1306** by Adafruit
   - Driver for SSD1306 OLED displays
   - Handles display initialization and updates

### Installation Steps
1. Open Arduino IDE
2. Go to **Tools → Manage Libraries**
3. Search for "Adafruit SSD1306"
4. Click **Install** (this will also install Adafruit GFX as dependency)
5. Wait for installation to complete

## Display Features

### 1. Boot Screen
Shows during initialization:
- Project name "Pravardha IoT"
- Initialization status

### 2. WiFi Status Screen
Displays after WiFi connection:
- Connection status (Connected/Failed)
- IP address (if connected)
- Brief delay before entering main loop

### 3. Live Sensor Display
Updates every 30 seconds with latest readings:
```
Pravardha IoT Node
------------------
Temp: 25.3 C
Humid: 60.2 %
Press: 1013.2 hPa
MQ135: 1024
Samples: 3/4
```

### 4. POST Status Screens

**During POST**:
```
Pravardha IoT
------------------
Sending data...
```

**Success**:
```
Pravardha IoT
------------------
POST: Success!
Code: 200

T:25.3 H:60%
P:1013 hPa
```
*(Shows for 3 seconds)*

**Error**:
```
Pravardha IoT
------------------
POST: Error!
Code: 400
```
*(Shows for 3 seconds)*

**WiFi Disconnected**:
```
Pravardha IoT
------------------
WiFi: Disconnected
POST: Skipped
```

## Code Configuration

The following defines are used in the firmware:

```cpp
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1  // Reset pin # (or -1 if sharing ESP32 reset)

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
```

### I2C Address
Default is **0x3C**. If your display uses a different address (e.g., 0x3D), modify the initialization:

```cpp
// In setup() function
if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {  // Change to 0x3D if needed
    Serial.println("✗ OLED display not found!");
}
```

## Troubleshooting

### Display Not Found
```
✗ OLED display not found! Check wiring.
Continuing without display...
```

**Solutions**:
1. **Check wiring**:
   - Verify VCC → 3.3V
   - Verify GND → GND
   - Verify SCL → GPIO 22
   - Verify SDA → GPIO 21

2. **Check I2C address**:
   - Run I2C scanner sketch to find the correct address
   - Common addresses: 0x3C or 0x3D
   - Modify `display.begin()` call if needed

3. **Check solder connections**:
   - Some OLED modules require soldering I2C address jumpers
   - Inspect solder joints on the back of the module

4. **Power issue**:
   - Ensure sufficient power supply
   - Try connecting VCC to 5V instead of 3.3V (most support both)

### Display Blank or Garbled

**Solution 1**: Check I2C pull-up resistors
- Most OLED modules have built-in pull-ups
- If using long wires, add external 4.7kΩ resistors (SDA to 3.3V, SCL to 3.3V)

**Solution 2**: Reset the display
- Power cycle the ESP32
- Check OLED_RESET pin configuration

**Solution 3**: Verify library installation
- Reinstall Adafruit SSD1306 and Adafruit GFX libraries
- Ensure both libraries are up to date

### Text Cut Off or Overlapping

The display uses a fixed 128x64 pixel grid. Text size 1 (default) is:
- **Width**: 6 pixels per character
- **Height**: 8 pixels per line
- **Max characters per line**: 21
- **Max lines**: 8

If text is cut off:
- Reduce string length
- Use smaller text size: `display.setTextSize(1)`
- Adjust cursor position with `display.setCursor(x, y)`

### Display Updates Slow

The code includes strategic delays:
- POST success/error screens show for 3 seconds
- Sensor readings update every 30 seconds

To adjust timing:
- Modify `delay(3000)` in `postData()` function
- Change `SAMPLE_INTERVAL_MS` for sensor update rate

## Testing the Display

### Step 1: Verify I2C Connection
Upload this simple test sketch to verify the display is detected:

```cpp
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

void setup() {
  Serial.begin(115200);
  Wire.begin();
  
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("Display not found!");
    while(1);
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("OLED Test");
  display.println("Hello World!");
  display.display();
}

void loop() {}
```

### Step 2: Run Full Firmware
1. Flash the complete `pravardha_esp32.ino`
2. Open Serial Monitor (115200 baud)
3. Watch for "✓ OLED display initialized" message
4. Observe display for boot screen → WiFi status → sensor readings

## Performance Notes

- **Update Rate**: Display refreshes after each sensor sample (every 30 seconds)
- **Power Consumption**: OLED adds ~20mA when active
- **Memory Usage**: Display buffer uses ~1KB of RAM
- **I2C Speed**: Default 100kHz (standard mode)

## Display Customization

### Change Text Size
```cpp
display.setTextSize(2);  // Larger text (2x size)
```

### Add Graphics
```cpp
display.drawLine(x1, y1, x2, y2, SSD1306_WHITE);
display.drawRect(x, y, width, height, SSD1306_WHITE);
display.drawCircle(x, y, radius, SSD1306_WHITE);
```

### Invert Display
```cpp
display.invertDisplay(true);  // White background, black text
```

### Adjust Contrast
```cpp
display.ssd1306_command(SSD1306_SETCONTRAST);
display.ssd1306_command(0xFF);  // Max contrast (0-255)
```

## Additional Features to Add

### 1. WiFi Signal Strength Indicator
```cpp
int8_t rssi = WiFi.RSSI();
display.print("RSSI: ");
display.print(rssi);
display.println(" dBm");
```

### 2. Progress Bar for Sampling
```cpp
int progress = (accumulated.sample_count * 100) / SAMPLES_PER_POST;
display.drawRect(0, 56, 128, 8, SSD1306_WHITE);
display.fillRect(0, 56, (128 * progress) / 100, 8, SSD1306_WHITE);
```

### 3. Scrolling Text for Long Messages
```cpp
display.startscrollleft(0x00, 0x07);  // Scroll entire display left
```

### 4. Rotating Display Content
Add alternating screens (e.g., show sensors on page 1, WiFi stats on page 2)

## References

- **Adafruit SSD1306 Library**: https://github.com/adafruit/Adafruit_SSD1306
- **Adafruit GFX Library**: https://github.com/adafruit/Adafruit-GFX-Library
- **ESP32 I2C Documentation**: https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/i2c.html

## Summary

The OLED display provides immediate visual feedback:
- ✅ Boot and initialization status
- ✅ Live sensor readings
- ✅ WiFi connection status
- ✅ Data transmission confirmation
- ✅ Error notifications

No need to connect to a computer to monitor the device status!
