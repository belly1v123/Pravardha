/**
 * Pravardha ESP32 IoT Sensor Node
 *
 * Reads environmental data from:
 * - DHT11 (temperature, humidity)
 * - BMP180 (barometric pressure)
 * - MQ135 (air quality ADC)
 *
 * Sends data via HTTPS POST to Supabase Edge Function
 *
 * Phase 1: Pre-shared key authentication
 * Future: Device ed25519 signatures
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_BMP085.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <time.h>
#include <ArduinoJson.h>

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================================

// WiFi credentials
#define WIFI_SSID "Pranjal_2.4"
#define WIFI_PASSWORD "PK@98400"

// Device authentication (from seed_device.ts output)
#define DEVICE_ID "80e4fcc6-f629-421a-ae0d-3f7cca664574"
#define DEVICE_KEY "1649e4c69169e7d02920c98873feb538501f990453466d871d5718c910ade4da"

// Supabase Edge Function URL
#define INGEST_URL "https://vyueuqfpxggmnzxhhbap.supabase.co/functions/v1/ingest"

// Pin definitions
#define DHT_PIN 4      // DHT11 data pin (GPIO4)
#define DHT_TYPE DHT11 // DHT11 sensor type
#define MQ135_PIN 36   // MQ135 analog pin (ADC1_CH6, GPIO36)

// OLED Display configuration
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

// Timing configuration
#define SAMPLE_INTERVAL_MS 30000 // Read sensors every 30 seconds
#define POST_INTERVAL_MS 120000  // POST to server every 2 minutes
#define SAMPLES_PER_POST 4       // Number of samples to average before POST

// NTP configuration
#define NTP_SERVER "pool.ntp.org"
#define GMT_OFFSET_SEC 0      // UTC offset in seconds
#define DAYLIGHT_OFFSET_SEC 0 // Daylight saving offset

// ============================================================================
// GLOBAL OBJECTS
// ============================================================================

DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_BMP085 bmp;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
WiFiClientSecure wifiClient;

// Sensor data accumulators
struct SensorData
{
    float temperature;
    float humidity;
    float pressure;
    uint16_t mq135_adc;
    uint8_t sample_count;
};

SensorData accumulated = {0, 0, 0, 0, 0};
unsigned long lastSampleTime = 0;
unsigned long lastPostTime = 0;

// ============================================================================
// SETUP
// ============================================================================

void setup()
{
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n\n=================================");
    Serial.println("Pravardha ESP32 IoT Sensor Node");
    Serial.println("=================================\n");

    // Initialize I2C for BMP180
    Wire.begin();

    // Initialize OLED Display
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C))
    {
        Serial.println("✗ OLED display not found! Check wiring.");
        Serial.println("  Continuing without display...");
    }
    else
    {
        Serial.println("✓ OLED display initialized");
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 0);
        display.println("Pravardha IoT");
        display.println("Initializing...");
        display.display();
    }

    // Initialize DHT11
    dht.begin();
    Serial.println("✓ DHT11 initialized");

    // Initialize BMP180
    if (!bmp.begin())
    {
        Serial.println("✗ BMP180 not found! Check wiring.");
        Serial.println("  Continuing without pressure sensor...");
    }
    else
    {
        Serial.println("✓ BMP180 initialized");
    }

    // Initialize MQ135 (ADC)
    pinMode(MQ135_PIN, INPUT);
    Serial.println("✓ MQ135 ADC initialized");

    // Connect to WiFi
    connectWiFi();

    // Update display with WiFi status
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("Pravardha IoT");
    display.println("------------------");
    if (WiFi.status() == WL_CONNECTED)
    {
        display.println("WiFi: Connected");
        display.print("IP: ");
        display.println(WiFi.localIP());
    }
    else
    {
        display.println("WiFi: Failed");
    }
    display.println("Starting...");
    display.display();
    delay(2000);

    // Initialize NTP time sync
    initNTP();

    // Configure HTTPS client (no cert validation for hackathon simplicity)
    wifiClient.setInsecure();

    Serial.println("\n✓ Setup complete. Starting sensor loop...\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop()
{
    unsigned long now = millis();

    // Sample sensors at SAMPLE_INTERVAL_MS
    if (now - lastSampleTime >= SAMPLE_INTERVAL_MS)
    {
        lastSampleTime = now;
        sampleSensors();
    }

    // POST accumulated data at POST_INTERVAL_MS
    if (now - lastPostTime >= POST_INTERVAL_MS && accumulated.sample_count > 0)
    {
        lastPostTime = now;
        postData();
        resetAccumulator();
    }

    // Small delay to prevent tight loop
    delay(100);
}

// ============================================================================
// WiFi FUNCTIONS
// ============================================================================

void connectWiFi()
{
    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30)
    {
        delay(1000);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.println("\n✓ WiFi connected");
        Serial.print("  IP address: ");
        Serial.println(WiFi.localIP());
        Serial.print("  Signal strength: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");
    }
    else
    {
        Serial.println("\n✗ WiFi connection failed!");
        Serial.println("  Check SSID/password and restart.");
    }
}

// ============================================================================
// NTP TIME SYNC
// ============================================================================

void initNTP()
{
    Serial.print("Syncing time with NTP server... ");
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);

    struct tm timeinfo;
    int attempts = 0;
    while (!getLocalTime(&timeinfo) && attempts < 10)
    {
        delay(1000);
        attempts++;
    }

    if (attempts < 10)
    {
        Serial.println("✓");
        Serial.print("  Current time: ");
        Serial.println(&timeinfo, "%Y-%m-%d %H:%M:%S");
    }
    else
    {
        Serial.println("✗ Failed to sync time");
    }
}

unsigned long long getCurrentTimeMs()
{
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo))
    {
        // Fallback to millis if NTP not synced
        return millis();
    }

    time_t now = mktime(&timeinfo);
    return (unsigned long long)now * 1000ULL;
}

// ============================================================================
// SENSOR READING FUNCTIONS
// ============================================================================

void sampleSensors()
{
    Serial.println("--- Sampling Sensors ---");

    // Read DHT11 (temperature and humidity)
    float temp = dht.readTemperature();
    float humidity = dht.readHumidity();

    if (isnan(temp) || isnan(humidity))
    {
        Serial.println("✗ DHT11 read failed");
        return;
    }

    Serial.print("Temperature: ");
    Serial.print(temp);
    Serial.println(" °C");

    Serial.print("Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");

    // Read BMP180 (pressure)
    float pressure = 0;
    if (bmp.begin())
    {
        pressure = bmp.readPressure() / 100.0; // Convert Pa to hPa
        Serial.print("Pressure: ");
        Serial.print(pressure);
        Serial.println(" hPa");
    }

    // Read MQ135 (ADC value)
    uint16_t mq135_adc = analogRead(MQ135_PIN);
    Serial.print("MQ135 ADC: ");
    Serial.println(mq135_adc);

    // Accumulate for averaging
    accumulated.temperature += temp;
    accumulated.humidity += humidity;
    accumulated.pressure += pressure;
    accumulated.mq135_adc += mq135_adc;
    accumulated.sample_count++;

    Serial.print("Accumulated samples: ");
    Serial.print(accumulated.sample_count);
    Serial.print(" / ");
    Serial.println(SAMPLES_PER_POST);
    Serial.println();

    // Update OLED display with latest readings
    updateDisplay(temp, humidity, pressure, mq135_adc);
}

// ============================================================================
// OLED DISPLAY UPDATE FUNCTION
// ============================================================================

void updateDisplay(float temp, float humidity, float pressure, uint16_t mq135)
{
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);

    // Title
    display.println("Pravardha IoT Node");
    display.println("------------------");

    // Temperature
    display.print("Temp: ");
    display.print(temp, 1);
    display.println(" C");

    // Humidity
    display.print("Humid: ");
    display.print(humidity, 1);
    display.println(" %");

    // Pressure
    display.print("Press: ");
    display.print(pressure, 1);
    display.println(" hPa");

    // Air Quality
    display.print("MQ135: ");
    display.println(mq135);

    // Sample count
    display.print("Samples: ");
    display.print(accumulated.sample_count);
    display.print("/");
    display.println(SAMPLES_PER_POST);

    display.display();
}

// ============================================================================
// HTTP POST FUNCTION
// ============================================================================

void postData()
{
    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("✗ WiFi not connected. Skipping POST.");

        // Show error on display
        display.clearDisplay();
        display.setCursor(0, 0);
        display.println("Pravardha IoT");
        display.println("------------------");
        display.println("WiFi: Disconnected");
        display.println("POST: Skipped");
        display.display();

        return;
    }

    Serial.println("=== Posting Data to Supabase ===");

    // Show posting status on display
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("Pravardha IoT");
    display.println("------------------");
    display.println("Sending data...");
    display.display();

    // Calculate averages
    float avg_temp = accumulated.temperature / accumulated.sample_count;
    float avg_humidity = accumulated.humidity / accumulated.sample_count;
    float avg_pressure = accumulated.pressure / accumulated.sample_count;
    uint16_t avg_mq135 = accumulated.mq135_adc / accumulated.sample_count;

    Serial.print("Averaged ");
    Serial.print(accumulated.sample_count);
    Serial.println(" samples:");
    Serial.print("  Temp: ");
    Serial.println(avg_temp);
    Serial.print("  Humidity: ");
    Serial.println(avg_humidity);
    Serial.print("  Pressure: ");
    Serial.println(avg_pressure);
    Serial.print("  MQ135: ");
    Serial.println(avg_mq135);

    // Get current timestamp
    unsigned long long ts_ms = getCurrentTimeMs();

    // Build JSON payload
    StaticJsonDocument<256> doc;
    doc["ts_ms"] = ts_ms;
    doc["temperature"] = avg_temp;
    doc["humidity"] = avg_humidity;
    doc["pressure"] = avg_pressure;
    doc["mq135_adc"] = avg_mq135;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    Serial.print("Payload: ");
    Serial.println(jsonPayload);

    // Send HTTPS POST request
    HTTPClient http;
    http.begin(wifiClient, INGEST_URL);

    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-id", DEVICE_ID);
    http.addHeader("x-device-key", DEVICE_KEY);

    int httpCode = http.POST(jsonPayload);

    if (httpCode > 0)
    {
        Serial.print("HTTP Response: ");
        Serial.println(httpCode);

        if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED)
        {
            String response = http.getString();
            Serial.print("Response body: ");
            Serial.println(response);
            Serial.println("✓ Data posted successfully\n");

            // Show success on display
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("Pravardha IoT");
            display.println("------------------");
            display.println("POST: Success!");
            display.print("Code: ");
            display.println(httpCode);
            display.println("");
            display.print("T:");
            display.print(avg_temp, 1);
            display.print(" H:");
            display.print(avg_humidity, 0);
            display.println("%");
            display.print("P:");
            display.print(avg_pressure, 0);
            display.println(" hPa");
            display.display();
            delay(3000); // Show success for 3 seconds
        }
        else
        {
            Serial.println("✗ Server returned error");
            String response = http.getString();
            Serial.println(response);

            // Show error on display
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("Pravardha IoT");
            display.println("------------------");
            display.println("POST: Error!");
            display.print("Code: ");
            display.println(httpCode);
            display.display();
            delay(3000);
        }
    }
    else
    {
        Serial.print("✗ HTTP POST failed: ");
        Serial.println(http.errorToString(httpCode));

        // Show connection error on display
        display.clearDisplay();
        display.setCursor(0, 0);
        display.println("Pravardha IoT");
        display.println("------------------");
        display.println("POST: Failed!");
        display.println("Connection error");
        display.display();
        delay(3000);
    }

    http.end();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

void resetAccumulator()
{
    accumulated.temperature = 0;
    accumulated.humidity = 0;
    accumulated.pressure = 0;
    accumulated.mq135_adc = 0;
    accumulated.sample_count = 0;
}
