-- Extension schema: county rollup, teachers, emergency alerts,
-- driver scheduling/substitutes, GPS geofencing.
-- Applied after schema.sql by the migrate script.

CREATE TABLE IF NOT EXISTS teachers (
  teacher_id   VARCHAR(20) PRIMARY KEY,
  first_name   VARCHAR(100) NOT NULL,
  last_name    VARCHAR(100) NOT NULL,
  school_id    VARCHAR(20) REFERENCES schools(school_id),
  grade_level  VARCHAR(10),
  room_number  VARCHAR(20)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(20) REFERENCES teachers(teacher_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS county_id VARCHAR(20) REFERENCES counties(county_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seeded_identity BOOLEAN NOT NULL DEFAULT FALSE;

-- One-time conversion of legacy shared-password seeded accounts. The marker
-- prevents future migrations from re-locking an account after activation.
UPDATE users SET seeded_identity = TRUE, signup_required = TRUE
WHERE seeded_identity = FALSE
  AND user_id ~ '^USR(00[1-6]|SCH[0-9]+|TCH[0-9]+|DRV[0-9]+|PAR[0-9]+|DIST[0-9]+|CNT[0-9]+)$';

UPDATE users SET email_verified = FALSE
WHERE seeded_identity = TRUE AND signup_required = TRUE;

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS email VARCHAR(254);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_driver_identity ON users (driver_id) WHERE driver_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_parent_identity ON users (parent_id) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_teacher_identity ON users (teacher_id) WHERE teacher_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_admin_identity ON users (school_id) WHERE school_id IS NOT NULL AND role = 'school_admin';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_district_admin_identity ON users (district_id) WHERE district_id IS NOT NULL AND role = 'district_admin';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_county_admin_identity ON users (county_id) WHERE county_id IS NOT NULL AND role = 'county_admin';

CREATE TABLE IF NOT EXISTS email_login_codes (
  challenge_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(20) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_login_codes_user ON email_login_codes(user_id, created_at DESC);

-- Emergency / broadcast alerts (weather, lockdown, route cancellation, etc.)
CREATE TABLE IF NOT EXISTS emergency_alerts (
  alert_id       VARCHAR(30) PRIMARY KEY,
  scope          VARCHAR(20) NOT NULL,        -- DISTRICT, SCHOOL, ROUTE, BUS
  district_id    VARCHAR(20) REFERENCES districts(district_id),
  school_id      VARCHAR(20) REFERENCES schools(school_id),
  route_id       VARCHAR(20) REFERENCES routes(route_id),
  bus_id         VARCHAR(20) REFERENCES buses(bus_id),
  severity       VARCHAR(20) DEFAULT 'INFO',  -- INFO, WARNING, CRITICAL
  title          VARCHAR(150) NOT NULL,
  message        TEXT NOT NULL,
  created_by     VARCHAR(100),
  status         VARCHAR(20) DEFAULT 'ACTIVE',
  created_date   TIMESTAMP DEFAULT NOW(),
  resolved_date  TIMESTAMP
);

-- Driver day-to-day availability, so dispatch can see who can cover a route
CREATE TABLE IF NOT EXISTS driver_availability (
  driver_id       VARCHAR(20) PRIMARY KEY REFERENCES drivers(driver_id),
  status          VARCHAR(20) DEFAULT 'AVAILABLE', -- AVAILABLE, ON_ROUTE, OUT, OFF_SHIFT
  reason          VARCHAR(150),
  updated_date    TIMESTAMP DEFAULT NOW()
);

-- Records when a substitute driver was swapped onto an assignment
CREATE TABLE IF NOT EXISTS substitute_assignments (
  substitution_id     VARCHAR(30) PRIMARY KEY,
  assignment_id       VARCHAR(20) REFERENCES driver_assignments(assignment_id),
  original_driver_id  VARCHAR(20) REFERENCES drivers(driver_id),
  substitute_driver_id VARCHAR(20) REFERENCES drivers(driver_id),
  reason               VARCHAR(150),
  created_date         TIMESTAMP DEFAULT NOW()
);

-- GPS pings from the driver app; used for geofencing against stops
CREATE TABLE IF NOT EXISTS bus_locations (
  ping_id      BIGSERIAL PRIMARY KEY,
  bus_id       VARCHAR(20) REFERENCES buses(bus_id),
  route_id     VARCHAR(20) REFERENCES routes(route_id),
  latitude     DECIMAL(10,7) NOT NULL,
  longitude    DECIMAL(10,7) NOT NULL,
  recorded_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bus_locations_bus ON bus_locations(bus_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON emergency_alerts(status);

-- Daily AM/PM runs are separate from driver assignments so one driver can
-- serve both shifts, or a second driver can take the afternoon route.
CREATE TABLE IF NOT EXISTS bus_trips (
  trip_id        VARCHAR(40) PRIMARY KEY,
  assignment_id  VARCHAR(20) REFERENCES driver_assignments(assignment_id),
  route_id       VARCHAR(20) NOT NULL REFERENCES routes(route_id),
  bus_id         VARCHAR(20) NOT NULL REFERENCES buses(bus_id),
  driver_id      VARCHAR(20) NOT NULL REFERENCES drivers(driver_id),
  service_date   DATE NOT NULL,
  direction      VARCHAR(20) NOT NULL CHECK (direction IN ('MORNING', 'AFTERNOON')),
  status         VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, service_date, direction)
);

ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS trip_id VARCHAR(40) REFERENCES bus_trips(trip_id),
  ADD COLUMN IF NOT EXISTS trip_direction VARCHAR(20);

ALTER TABLE bus_locations
  ADD COLUMN IF NOT EXISTS trip_id VARCHAR(40) REFERENCES bus_trips(trip_id);

CREATE INDEX IF NOT EXISTS idx_bus_trips_driver_day ON bus_trips(driver_id, service_date, status);
CREATE INDEX IF NOT EXISTS idx_bus_locations_trip_time ON bus_locations(trip_id, recorded_at DESC);

-- New transport events explicitly represent boarding and drop-off per run.
CREATE TABLE IF NOT EXISTS trip_student_events (
  trip_event_id       VARCHAR(40) PRIMARY KEY,
  trip_id             VARCHAR(40) NOT NULL REFERENCES bus_trips(trip_id),
  student_id          VARCHAR(20) NOT NULL REFERENCES students(student_id),
  stop_id             VARCHAR(20) REFERENCES route_stops(stop_id),
  boarded_at          TIMESTAMPTZ,
  dropped_off_at      TIMESTAMPTZ,
  verification_method VARCHAR(30),
  status              VARCHAR(30) NOT NULL DEFAULT 'EXPECTED',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_student_events_student ON trip_student_events(student_id, trip_id);

CREATE TABLE IF NOT EXISTS trip_stop_events (
  trip_id      VARCHAR(40) NOT NULL REFERENCES bus_trips(trip_id),
  stop_id      VARCHAR(20) NOT NULL REFERENCES route_stops(stop_id),
  arrived_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  departed_at  TIMESTAMPTZ,
  PRIMARY KEY (trip_id, stop_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_stop_events_trip_time ON trip_stop_events(trip_id, arrived_at);

-- Classroom attendance is separate from bus transportation events.
CREATE TABLE IF NOT EXISTS class_attendance (
  student_id       VARCHAR(20) NOT NULL REFERENCES students(student_id),
  attendance_date  DATE NOT NULL,
  status           VARCHAR(20) NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
  marked_by        VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id),
  note             VARCHAR(255),
  marked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_class_attendance_day ON class_attendance(attendance_date, status);

-- A parent/teacher thread is scoped to one student and their assigned teacher.
CREATE TABLE IF NOT EXISTS parent_teacher_conversations (
  conversation_id  VARCHAR(40) PRIMARY KEY,
  student_id       VARCHAR(20) NOT NULL REFERENCES students(student_id),
  parent_id        VARCHAR(20) NOT NULL REFERENCES parents_guardians(parent_id),
  teacher_id       VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, parent_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS parent_teacher_messages (
  message_id       VARCHAR(40) PRIMARY KEY,
  conversation_id  VARCHAR(40) NOT NULL REFERENCES parent_teacher_conversations(conversation_id),
  sender_user_id   VARCHAR(20) NOT NULL REFERENCES users(user_id),
  body             TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(body)) BETWEEN 1 AND 2000),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_parent_teacher_messages_thread ON parent_teacher_messages(conversation_id, sent_at);

-- Explicit consent and provider delivery tracking for optional SMS alerts.
ALTER TABLE parents_guardians
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_opt_in_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS notification_outbox (
  outbox_id          VARCHAR(40) PRIMARY KEY,
  trip_id            VARCHAR(40) NOT NULL REFERENCES bus_trips(trip_id),
  student_id         VARCHAR(20) NOT NULL REFERENCES students(student_id),
  parent_id          VARCHAR(20) NOT NULL REFERENCES parents_guardians(parent_id),
  notification_type  VARCHAR(40) NOT NULL,
  channel            VARCHAR(20) NOT NULL CHECK (channel IN ('SMS')),
  destination        VARCHAR(150),
  message_body       TEXT NOT NULL,
  status             VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  provider_message_id VARCHAR(100),
  attempt_count      INT NOT NULL DEFAULT 0,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, student_id, notification_type, channel)
);

-- Idempotency for the one-time "bus is about 10 minutes away" alert.
CREATE TABLE IF NOT EXISTS bus_trip_alerts (
  trip_id        VARCHAR(40) NOT NULL REFERENCES bus_trips(trip_id),
  student_id     VARCHAR(20) NOT NULL REFERENCES students(student_id),
  alert_type     VARCHAR(40) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_id, student_id, alert_type)
);
