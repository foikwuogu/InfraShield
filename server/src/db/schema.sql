-- InfraShield Smart School Transportation & Attendance System
-- Core schema (student boarding verification, attendance, delay-based
-- tardy override, driver/school/parent/district dashboards).
-- Extension tables (county rollup, teachers, alerts, scheduling, GPS)
-- live in schema_ext.sql, applied after this file by the migrate script.

CREATE TABLE IF NOT EXISTS counties (
  county_id       VARCHAR(20) PRIMARY KEY,
  county_name     VARCHAR(100) NOT NULL,
  state           VARCHAR(50),
  contact_name    VARCHAR(100),
  contact_email   VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS districts (
  district_id          VARCHAR(20) PRIMARY KEY,
  district_name        VARCHAR(150) NOT NULL,
  county_id            VARCHAR(20) REFERENCES counties(county_id),
  address              VARCHAR(255),
  phone                VARCHAR(30),
  superintendent_name  VARCHAR(150),
  status               VARCHAR(20) DEFAULT 'ACTIVE',
  created_date         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schools (
  school_id       VARCHAR(20) PRIMARY KEY,
  district_id     VARCHAR(20) REFERENCES districts(district_id),
  school_name     VARCHAR(150) NOT NULL,
  school_type     VARCHAR(50),
  address         VARCHAR(255),
  principal_name  VARCHAR(150),
  phone           VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS parents_guardians (
  parent_id              VARCHAR(20) PRIMARY KEY,
  first_name             VARCHAR(100) NOT NULL,
  last_name              VARCHAR(100) NOT NULL,
  relationship           VARCHAR(50),
  phone                  VARCHAR(30),
  email                  VARCHAR(150),
  address                VARCHAR(255),
  emergency_contact_flag BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS students (
  student_id        VARCHAR(20) PRIMARY KEY,
  student_number    VARCHAR(30) UNIQUE NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  grade_level       VARCHAR(10),
  school_id         VARCHAR(20) REFERENCES schools(school_id),
  home_address      VARCHAR(255),
  parent_id         VARCHAR(20) REFERENCES parents_guardians(parent_id),
  photo_url         VARCHAR(255),
  status            VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS drivers (
  driver_id               VARCHAR(20) PRIMARY KEY,
  employee_number         VARCHAR(30) UNIQUE,
  first_name              VARCHAR(100) NOT NULL,
  last_name               VARCHAR(100) NOT NULL,
  license_number          VARCHAR(50),
  phone                   VARCHAR(30),
  email                   VARCHAR(150),
  hire_date               DATE,
  certification_status    VARCHAR(30) DEFAULT 'CERTIFIED',
  background_check_status VARCHAR(30) DEFAULT 'CLEARED',
  status                  VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS buses (
  bus_id        VARCHAR(20) PRIMARY KEY,
  bus_number    VARCHAR(20) NOT NULL,
  vehicle_vin   VARCHAR(50),
  license_plate VARCHAR(20),
  capacity      INT,
  status        VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS routes (
  route_id             VARCHAR(20) PRIMARY KEY,
  route_name           VARCHAR(150) NOT NULL,
  district_id          VARCHAR(20) REFERENCES districts(district_id),
  school_id            VARCHAR(20) REFERENCES schools(school_id),
  start_location       VARCHAR(150),
  end_location         VARCHAR(150),
  scheduled_start_time TIME,
  scheduled_end_time   TIME,
  active_flag          BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS route_stops (
  stop_id          VARCHAR(20) PRIMARY KEY,
  route_id         VARCHAR(20) REFERENCES routes(route_id),
  stop_name        VARCHAR(150) NOT NULL,
  latitude         DECIMAL(10,7),
  longitude        DECIMAL(10,7),
  scheduled_time   TIME,
  sequence_number  INT
);

CREATE TABLE IF NOT EXISTS student_routes (
  student_route_id VARCHAR(20) PRIMARY KEY,
  student_id       VARCHAR(20) REFERENCES students(student_id),
  route_id         VARCHAR(20) REFERENCES routes(route_id),
  stop_id          VARCHAR(20) REFERENCES route_stops(stop_id),
  status           VARCHAR(20) DEFAULT 'ACTIVE'
);

-- Which driver/bus runs which route on a given day
CREATE TABLE IF NOT EXISTS driver_assignments (
  assignment_id   VARCHAR(20) PRIMARY KEY,
  driver_id       VARCHAR(20) REFERENCES drivers(driver_id),
  bus_id          VARCHAR(20) REFERENCES buses(bus_id),
  route_id        VARCHAR(20) REFERENCES routes(route_id),
  assignment_date DATE NOT NULL,
  shift_type      VARCHAR(20),
  start_time      TIME,
  end_time        TIME,
  status          VARCHAR(20) DEFAULT 'SCHEDULED'
);

-- The core event: a student boarding / exiting a bus
CREATE TABLE IF NOT EXISTS attendance_events (
  event_id             VARCHAR(30) PRIMARY KEY,
  student_id           VARCHAR(20) REFERENCES students(student_id),
  bus_id               VARCHAR(20) REFERENCES buses(bus_id),
  driver_id            VARCHAR(20) REFERENCES drivers(driver_id),
  route_id             VARCHAR(20) REFERENCES routes(route_id),
  stop_id              VARCHAR(20) REFERENCES route_stops(stop_id),
  board_time           TIMESTAMP,
  drop_off_time        TIMESTAMP,
  verification_method  VARCHAR(30),
  verification_score   DECIMAL(5,2),
  attendance_status    VARCHAR(40) DEFAULT 'BOARDED',
  created_date         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bus_delays (
  delay_id      VARCHAR(20) PRIMARY KEY,
  bus_id        VARCHAR(20) REFERENCES buses(bus_id),
  route_id      VARCHAR(20) REFERENCES routes(route_id),
  driver_id     VARCHAR(20) REFERENCES drivers(driver_id),
  delay_reason  VARCHAR(150),
  delay_minutes INT NOT NULL,
  reported_time TIMESTAMP DEFAULT NOW(),
  resolved_time TIMESTAMP,
  status        VARCHAR(20) DEFAULT 'ACTIVE'
);

-- The InfraShield innovation: auditable tardy -> excused overrides
CREATE TABLE IF NOT EXISTS attendance_overrides (
  override_id          VARCHAR(30) PRIMARY KEY,
  student_id           VARCHAR(20) REFERENCES students(student_id),
  attendance_event_id  VARCHAR(30) REFERENCES attendance_events(event_id),
  original_status      VARCHAR(40),
  new_status            VARCHAR(40),
  reason                VARCHAR(255),
  approved_by           VARCHAR(100) DEFAULT 'SYSTEM_AUTO',
  created_date          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parent_notifications (
  notification_id   VARCHAR(30) PRIMARY KEY,
  student_id        VARCHAR(20) REFERENCES students(student_id),
  parent_id         VARCHAR(20) REFERENCES parents_guardians(parent_id),
  notification_type VARCHAR(50),
  message           TEXT,
  delivery_method   VARCHAR(30) DEFAULT 'APP_PUSH',
  sent_time         TIMESTAMP DEFAULT NOW(),
  delivery_status   VARCHAR(20) DEFAULT 'SENT'
);

-- Login accounts, one per human user, linked to their underlying role record
CREATE TABLE IF NOT EXISTS users (
  user_id        VARCHAR(20) PRIMARY KEY,
  username       VARCHAR(100) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(30) NOT NULL,
  driver_id      VARCHAR(20) REFERENCES drivers(driver_id),
  parent_id      VARCHAR(20) REFERENCES parents_guardians(parent_id),
  school_id      VARCHAR(20) REFERENCES schools(school_id),
  district_id    VARCHAR(20) REFERENCES districts(district_id),
  created_date   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_events(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_bus ON attendance_events(bus_id);
CREATE INDEX IF NOT EXISTS idx_attendance_board_time ON attendance_events(board_time);
CREATE INDEX IF NOT EXISTS idx_delays_bus ON bus_delays(bus_id);
CREATE INDEX IF NOT EXISTS idx_notifications_parent ON parent_notifications(parent_id);
