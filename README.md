# Pravardha - IoT Environmental Monitoring with Solana Certification

> A minimal but complete IoT → HTTP → Supabase → Solana pipeline for indoor farm environmental monitoring and data certification.

## Architecture Overview

```
┌─────────────┐
│  ESP32 +    │  Reads: DHT11 (temp/humidity), BMP180 (pressure), MQ135 (air quality ADC)
│  Sensors    │  ──HTTPS POST──▶
└─────────────┘

┌─────────────────────────────────────────────────────┐
│  Supabase                                           │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │ Edge Function│───▶│ Postgres Tables:         │  │
│  │  /ingest     │    │  - devices               │  │
│  │              │    │  - device_keys (hashed)  │  │
│  └──────────────┘    │  - readings (raw)        │  │
│                      │  - aggregates_15m        │  │
│                      │  - batches               │  │
│                      └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────┐
│  Web Dashboard (React + Vite)                       │
│  - Live sensor data (24h charts)                    │
│  - Batch creation & certificate pages               │
│  - Public verify page with Solana proof             │
└─────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────┐
│  Solana (Anchor - Devnet)                           │
│  - WindowAggregate PDA per 15-min window            │
│  - Stores: stats + merkle_root + offchain_uri       │
│  - Public verification via on-chain data            │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

- **Hardware**: ESP32, DHT11, BMP180, MQ135
- **Transport**: HTTPS POST (no MQTT)
- **Backend**: Supabase (Postgres + Edge Functions + RLS)
- **Frontend**: React + Vite + Recharts
- **Blockchain**: Solana Devnet (Anchor framework)

## Contributing

This is a hackathon project. Contributions welcome!

```bash
# Fork the repo
git clone https://github.com/yourusername/pravardha.git
cd pravardha

# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
# ...

# Submit PR
git push origin feature/your-feature
```

---

## License

MIT License - see LICENSE file

---

## Acknowledgments

- Solana Foundation (Devnet support)
- Supabase (Edge Functions + Postgres)
- Anchor Framework (Smart contract tooling)

---

## Contact

For questions or demo requests:
- Email: pranjalkharel86@gmail.com
- X: @pranjalkharel61 , @Pravardha25, @AadarsanD

---
