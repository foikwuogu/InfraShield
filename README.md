# InfraShield — Smart School Transportation & Attendance System

A working implementation of the InfraShield concept from the project
brief: student boarding verification, driver/school/parent/district
dashboards, and the **Attendance Assurance Engine** — the automation
that excuses students from a tardy mark when their bus is delayed.

This demo includes the transportation and attendance system plus role-specific views:

- Student, bus, driver, route, and stop data model
- Boarding verification → attendance events
- Bus delay reporting → automatic tardy override + parent notification
- Driver dashboard (manifest + board students + report delays)
- School attendance office dashboard (live present/in-transit/excused/absent)
- Parent dashboard (child status + notification timeline)
- Teacher dashboard (grade roster + transportation-linked attendance)
- District command center (fleet summary, campus rollup, active delays, dispatch)
- County command center (district and campus rollup)
- JWT-based login with role-based dashboards for drivers, school admins, teachers, parents, district admins, and county admins

## Authors

- Friday Ogochukwu Ikwuogu
- Joe Achi — Computer Science student, University of Benin, Nigeria
- Halimat Popoola Oluwabukola — Computer Science Department, University of Texas Permian Basin, Texas, USA (`popoola_h51572@utpb.edu`)

The seed creates **13 demo campuses across eight Permian Basin counties and districts**, including Midland, Odessa, Andrews, Big Spring, Stanton, Monahans, Crane, and Pecos. It contains **20 drivers, 20 teachers, and 50 students per campus (650 total)** with teacher/class assignment, morning and afternoon trip runs, activation-required parent/staff identities, and demo attendance. Route assignments and attendance are dated for the day the seed runs. All sample names, contacts, phone numbers, and student records are fictional demo data.

Teachers can record class attendance and message a student's parent; parents can see class status, separate AM/PM boarding and drop-off times, message the assigned teacher, and view afternoon route progress/estimated arrival. Driver GPS pings update stop progress and create an idempotent in-app notification when an afternoon bus is estimated to be within ten minutes of a student's stop. SMS is optional and sent only after parent opt-in. Biometric capture and production FERPA/COPPA compliance are not implemented.

### Student identity at boarding

Drivers can scan a school-card barcode/QR code with a keyboard-wedge scanner or type the school-issued student ID; the server checks that ID against the active trip's roster before it records boarding. A clearly labeled manual identity check is also available. The face-camera, fingerprint, and voice rows are capability placeholders only—not biometric recognition. They remain unavailable until a district integrates and validates its bus camera/reader and an approved identity provider. This app does not record face images, fingerprint templates, or voice samples, and does not infer a student's identity from a camera. Before deploying any biometric system for minors, obtain district/legal approval, family consent, retention/deletion rules, security review, and a tested non-biometric fallback.

## Phone, tablet, and installable app

The same React app adapts to phone, iPad/tablet, and desktop layouts. Drivers can use the touch-sized route manifest on an in-bus tablet; parents can install the parent dashboard from the same app after signing in. InfraShield is a **Progressive Web App (PWA)** rather than separate App Store/Google Play binaries:

- Android: open the deployed HTTPS site in Chrome and use **Get mobile app** or the browser menu's **Install app** option.
- iPhone/iPad: open the HTTPS site in Safari, tap **Share**, then **Add to Home Screen**. The login and dashboard headers include install guidance.
- For same-Wi-Fi layout testing, start Vite with `npm run dev -- --host 0.0.0.0` and open the computer's LAN address on the device. Phone/tablet installation requires HTTPS; ordinary LAN HTTP is for layout testing only.

The service worker caches only the static app shell and assets; authenticated API/student data is never cached for offline use. In production, serve the frontend over HTTPS and proxy the same-origin `/api` path to the Express server, or set `VITE_API_URL` to the API's HTTPS URL at build time. Never point a phone build at `localhost`, which refers to the phone itself.

## Architecture

```
InfraShield/
├── server/     Node.js + Express + PostgreSQL REST API
└── client/     React (Vite) frontend
```

- **Backend:** Node.js, Express, PostgreSQL (`pg`), JWT auth, bcrypt password hashing.
- **Frontend:** React 18 + Vite + React Router, plain CSS (no framework lock-in).
- Chosen for a smooth path to real deployment: Postgres runs on Render/Railway/Supabase,
  the Express API deploys as-is to any Node host, and the Vite build is static output
  deployable to Vercel/Netlify.

## Prerequisites

- Node.js 20.19+ LTS or 22.12+ and npm (Node 21 is not supported by the client build toolchain)
- Docker (for the easiest local Postgres) — or any Postgres 14+ instance

## 1. Start Postgres locally

For one-command startup after Node/npm and Docker Compose are installed, run `npm run dev:all` from the project root. It starts the database, migrates/seeds the demo records, then launches the API and web app. To start PostgreSQL by itself, run `docker compose up -d --wait`.

Docker Compose publishes Postgres on `localhost:5434` with database `infrashield`,
user `infrashield`, password `infrashield` (see `docker-compose.yml`).

Don't have Docker? Point `DATABASE_URL` in `server/.env` at any Postgres
instance you already have running.

## 2. Set up and run the backend manually

```bash
cd server
cp .env.example .env      # edit if you changed DB credentials
npm install
npm run migrate           # creates all tables
npm run seed               # inserts sample records and sign-up-eligible user identities
npm run dev                 # starts the API on http://localhost:4000
```

The seed script prints role counts for activation-eligible identities. It no
longer creates accounts with shared demo passwords; app users activate linked
identities through the Create account flow.

## 3. Set up and run the frontend manually

In a second terminal:

```bash
cd client
cp .env.example .env      # points VITE_API_URL at the local API
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The client
uses the Vite `/api` proxy during development.

Run `npm run check` from the project root to start/wait for PostgreSQL, apply
migrations and seed records, start the API, validate record counts, role
routing, auth/OTP flows, and build the production client. The auth-flow check
temporarily claims a seeded parent identity and restores it when finished.
Use this command with a local test database, not production data.

## Sign-up and sign-in

There are no shared seeded passwords. The seed creates linked school,
student/guardian, teacher, and driver identities that users activate through
**Create account**. Parents provide the registered guardian email plus a
student school ID. Teachers use their teacher ID and registered email;
drivers use their employee ID and registered email. One account may claim a
linked identity. A new random temporary password is generated for that
account and sent to its email, along with a separate six-digit verification
code. After email verification, sign-in sends an additional email OTP unless
the user has enabled an authenticator app. New users must change the
temporary password before a dashboard session is granted.

School, district, and county administrators additionally need the matching
organization ID and a district-issued invite code. Set
`ADMIN_SIGNUP_INVITE_CODE` in `server/.env` to enable admin self-registration;
without it, administrative registration is closed.

For local development only, SMTP may be omitted: generated temporary
passwords and OTP codes are printed by the API to the development terminal.
Production refuses signup or email-code issuance without SMTP. Configure
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in
`server/.env` before deploying. Never expose development email output or
temporary passwords in production logs.

The 13-campus seed retains example guardian, teacher, and driver emails for
local testing. Replace them with verified organization-managed addresses
before production signup. To test a role, activate one of the linked
identities from **Create account**. For example, Andrews Middle School
students are linked to school `SCH007`; the seeded teacher ID is `TCH106`.

Demo attendance shows transported, in-transit, and not-yet-boarded students.
The parent dashboard presents independent AM and PM times and polls the PM
bus route. Teachers can set Present/Absent/Late/Excused and start a family
message thread. To enable real SMS, configure `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`; the parent must explicitly
opt in. ETA is estimated from GPS distance and `BUS_AVERAGE_SPEED_KPH` (25
by default), not a guaranteed arrival time.

## Running in VS Code

1. Open the `InfraShield` folder in VS Code (`code .`).
2. Open two integrated terminals: one in `server/`, one in `client/`.
3. Recommended extensions: *ESLint*, *PostgreSQL* (by Chris Kolkman) for
   browsing the database, *Thunder Client* or *REST Client* for poking
   at the API directly.
4. `server/src/index.js` is the API entry point; `client/src/App.jsx`
   is the frontend entry point — both are good places to start reading.

## API overview

All routes except `/api/auth/signup`, `/api/auth/login`, `/api/auth/verify-email`,
`/api/auth/request-email-code`, and `/api/health` require
`Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Log in, returns JWT |
| POST | `/api/attendance/board` | Record a student boarding a bus |
| POST | `/api/attendance/:eventId/dropoff` | Record a student exiting |
| GET  | `/api/attendance/students/:studentId/status` | Latest status for one student |
| POST | `/api/delays` | Report a bus delay (triggers auto tardy-excuse over 10 min) |
| GET  | `/api/delays/active` | List active delays |
| GET  | `/api/dashboards/driver/:driverId` | Driver's route + manifest |
| GET  | `/api/dashboards/school/:schoolId` | School attendance office view |
| GET  | `/api/dashboards/teacher/:teacherId` | Teacher's grade roster and attendance |
| GET  | `/api/dashboards/parent/:parentId` | Parent's children + notifications |
| GET  | `/api/dashboards/district/:districtId` | District summary + active delays |
| GET  | `/api/dashboards/county/:countyId` | County rollup by district |
| POST | `/api/family/class-attendance/:studentId` | Assigned teacher records today's class attendance |
| GET/POST | `/api/family/messages/student/:studentId` | Parent/assigned teacher reads or sends a student-scoped message |
| GET | `/api/family/messages/inbox` | Current parent's or teacher's conversation list |
| POST | `/api/family/sms-preference` | Parent explicitly opts in/out of text alerts |
| POST | `/api/gps/ping` | Assigned driver records trip GPS and stop-arrival progress |
| GET | `/api/gps/student/:studentId/route` | Parent/assigned teacher reads authorized student route and estimated arrival |
| GET  | `/api/students`, `/api/buses`, `/api/drivers`, `/api/routes` | Reference lookups |

## Deploying to production

1. **Database:** create a managed Postgres instance (Render, Railway,
   Supabase, or AWS RDS). Run `npm run migrate` and `npm run seed`
   (or your own real data load) against it once.
2. **API:** deploy `server/` to Render, Railway, Fly.io, or any Node
   host. Set `DATABASE_URL`, `JWT_SECRET` (a long random value — don't
   reuse the example), `CLIENT_ORIGIN` (your frontend's URL), and `PORT`
   as environment variables there.
3. **Frontend:** run `npm run build` in `client/` and deploy the
   `client/dist` folder to Vercel, Netlify, or Cloudflare Pages over
   HTTPS. Set `VITE_API_URL` to `/api` and proxy that path to Express,
   or set it to the API's public HTTPS `/api` URL as a build-time
   environment variable.
4. Before going live: set unique `JWT_SECRET`, `OTP_PEPPER`,
   `TOTP_ENCRYPTION_KEY`, SMTP credentials and an administrator invite code;
   replace sample contact emails with verified organization addresses; choose
   and document the project's license; use HTTPS and configure database backups.

## Security notes for this MVP

- Passwords are hashed with bcrypt; JWTs expire (12h by default).
- There's no rate limiting or refresh-token rotation yet — add before
  handling real student data.
- School-ID barcode/QR scanning and typed-ID roster validation are
   implemented. AI face matching, fingerprint capture, and voice recognition
   are not implemented; they require approved bus hardware and provider
   integration. This web app does not collect biometric samples.
- FERPA/COPPA compliance work (data retention policy, access auditing,
  parental consent flows) is out of scope for this MVP and should be
  reviewed with district counsel before any real rollout.
