# AstanaHub Employee

Web and mobile attendance tracking system for hub employees.

The project is focused on presence during the workday: employees mark arrival/departure, the mobile app sends GPS points during the shift, and hub directors see who is inside or outside the hub radius on a map.

## Features

- Owner dashboard for hubs and regional directors.
- Hub director dashboard for employees, attendance, reports, geofence setup, and GPS alerts.
- Employee web dashboard with separate `Пришел` and `Ушел` buttons.
- Employee import from Excel/CSV/TSV.
- Monthly Excel-compatible report with separate tables for employees and director.
- Leaflet map for hub geofence setup.
- Presence map for latest employee GPS locations.
- Mobile Expo app for employee login, attendance, and background GPS tracking.

## Roles

- `super_admin`: creates hubs, creates and edits hub directors.
- `hub_admin`: manages employees of their hub, geofence, reports, GPS alerts.
- `employee`: marks arrival/departure and sends GPS locations from the mobile app.

## Web App

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Typecheck:

```bash
npm run lint
```

## Environment

Create `.env` with Supabase values:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must not be exposed to the mobile app.

## Database

Apply `database_migration.sql` in Supabase before testing new features.

Important tables/columns added by the migration:

- `shifts`
- `breaks`
- employee GPS columns in `attendance_logs`
- `director_attendance_logs`
- `users.position`
- `geofence_events`
- `employee_location_points`

## Mobile App

The mobile app lives in `mobile/`.

Install dependencies:

```bash
cd mobile
npm install
```

Run Expo:

```bash
npm run start
```

Typecheck:

```bash
npm run typecheck
```

For real phone testing, set the API URL to your computer LAN address, not `localhost`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000 npm run start
```

The mobile app:

- logs in with employee username/password;
- calls `/api/mobile/login`;
- sends arrival/departure to `/api/mobile/attendance`;
- sends GPS points to `/api/mobile/location`;
- starts background GPS tracking after `Пришел`;
- stops tracking after `Ушел`.

## Mobile API

- `POST /api/mobile/login`
- `POST /api/mobile/attendance`
- `POST /api/mobile/location`

Mobile auth uses a signed bearer token from `lib/mobile-auth.ts`.

## GPS Presence Logic

When the employee is checked in, the mobile app sends GPS points. The backend:

1. saves every point in `employee_location_points`;
2. calculates distance to the hub with the Haversine formula;
3. marks the point as inside/outside the geofence;
4. creates a `geofence_events` row when the employee is outside the radius.

The director dashboard shows:

- hub radius on the map;
- latest employee points;
- green marker for inside the radius;
- red marker for outside the radius;
- counts for inside/outside/no GPS;
- latest GPS alerts.

## Notes

Browser GPS is not reliable for 12-hour background tracking. The mobile app is required for stable workday presence monitoring.
