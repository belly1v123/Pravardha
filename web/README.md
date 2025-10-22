# Pravardha Web Dashboard

React + Vite dashboard for visualizing IoT sensor data and managing batch certifications.

## Prerequisites

- Node.js 18+ and npm
- Supabase project configured (see `../supabase/README.md`)

## Installation

```bash
cd web
npm install
```

## Configuration

1. Copy environment template:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
   VITE_PRAVARDHA_PROGRAM_ID=YourProgramIDHere
   ```

3. Get credentials from Supabase Dashboard → Settings → API:
   - Project URL → `VITE_SUPABASE_URL`
   - Project API keys → anon public → `VITE_SUPABASE_ANON_KEY`

## Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Build

```bash
npm run build
```

Output in `dist/` directory.

## Deployment

### Vercel (Recommended)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Set environment variables in Vercel dashboard

### Netlify

1. Build:
   ```bash
   npm run build
   ```

2. Deploy `dist/` folder via Netlify CLI or drag-and-drop

### Static Hosting

Serve `dist/` folder with any static host (GitHub Pages, AWS S3, etc.)

## Features

### Dashboard Page (`/`)

- Device selector
- Real-time sensor readings (last 24 hours)
- Auto-refresh every 30 seconds
- Charts:
  - Temperature & Humidity
  - Pressure
  - Air Quality (MQ135 ADC)

### Batches Page (`/batches`)

- Create new batch certifications
- List all batches
- Filter by status (open/closed/certified)
- View certificate link

### Verify Page (`/verify/:batchId`)

- Public certificate page (no auth required)
- Batch information
- Environmental summary stats
- On-chain verification status
- 15-minute aggregate windows
- Links to Solana Explorer for transactions

## Architecture

```
src/
├── main.tsx              # Entry point
├── App.tsx               # Router setup
├── index.css             # Global styles
├── lib/
│   └── supabaseClient.ts # Supabase config + types
├── pages/
│   ├── Dashboard.tsx     # Live sensor data
│   ├── Batches.tsx       # Batch management
│   └── Verify.tsx        # Public certificate
└── components/           # (future: reusable components)
```

## Troubleshooting

### "Missing Supabase environment variables"

- Verify `.env.local` exists and has correct values
- Restart dev server after changing `.env.local`
- Check variable names start with `VITE_` (required by Vite)

### "No active devices found"

- Run `scripts/seed_device.ts` to create a device
- Check device is marked `is_active = true` in Supabase
- Verify RLS policies allow anon access to devices table

### "No readings in the last 24 hours"

- Ensure ESP32 is flashed and online
- Check firmware config (device ID, device key, ingest URL)
- Test ingest endpoint with curl (see supabase/README.md)
- Check Supabase Edge Function logs

### Charts not rendering

- Verify recharts is installed: `npm install recharts`
- Check browser console for errors
- Ensure readings data has valid numeric values

### "Cannot read property of undefined"

- Data may not be loaded yet
- Add null checks: `device?.name`
- Use optional chaining and fallbacks

## Customization

### Adding a New Sensor

1. Update Supabase schema (add column to `readings`)
2. Update firmware to send new sensor value
3. Update `src/lib/supabaseClient.ts` types
4. Add new chart in Dashboard.tsx

Example:
```typescript
// In Dashboard.tsx
<LineChart data={chartData}>
  <Line dataKey="new_sensor" stroke="#8b5cf6" name="New Sensor" />
</LineChart>
```

### Changing Theme Colors

Edit `src/index.css`:

```css
:root {
  --primary-color: #3b82f6;
  --success-color: #10b981;
  --error-color: #ef4444;
}

.btn-primary {
  background: var(--primary-color);
}
```

### Adding Authentication

1. Enable Supabase Auth in dashboard
2. Add Auth UI:
   ```bash
   npm install @supabase/auth-ui-react @supabase/auth-ui-shared
   ```
3. Wrap protected routes with auth check
4. Update RLS policies to use `auth.uid()`

Example:
```typescript
import { useUser } from '@supabase/auth-helpers-react';

function ProtectedRoute({ children }) {
  const user = useUser();
  if (!user) return <Navigate to="/login" />;
  return children;
}
```

## Performance Optimization

### Reduce Bundle Size

- Use dynamic imports for large components:
  ```typescript
  const Dashboard = lazy(() => import('./pages/Dashboard'));
  ```

### Optimize Re-renders

- Use React.memo for expensive components
- Implement useMemo for computed values
- Debounce auto-refresh

### Database Queries

- Add indexes for frequently queried columns
- Use Supabase realtime subscriptions instead of polling
- Implement pagination for large datasets

## Testing

```bash
npm run lint   # Check for code issues
npm run build  # Ensure production build works
```

For E2E tests (future):
```bash
npm install --save-dev @playwright/test
npx playwright test
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT

## Support

For issues specific to the web dashboard:
- Check browser console for errors
- Verify Supabase connection
- See main README.md troubleshooting section
