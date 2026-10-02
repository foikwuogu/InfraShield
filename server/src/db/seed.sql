-- Sample data matching the InfraShield project brief examples
-- This file holds synthetic school/district reference data only.

INSERT INTO counties (county_id, county_name, state, contact_name, contact_email) VALUES
('CNT001', 'Midland County', 'TX', 'Dana Ruiz', 'druiz@midlandcounty.gov')
ON CONFLICT (county_id) DO NOTHING;

INSERT INTO districts (district_id, district_name, county_id, address, phone, superintendent_name) VALUES
('DIST001', 'Midland ISD', 'CNT001', '615 W Missouri Ave, Midland, TX', '432-570-4400', 'Dr. Angela Reyes')
ON CONFLICT (district_id) DO NOTHING;

INSERT INTO schools (school_id, district_id, school_name, school_type, address, principal_name, phone) VALUES
('SCH001', 'DIST001', 'Midland High School', 'High School', '906 N Alameda St, Midland, TX', 'Robert Ellison', '432-570-4600'),
('SCH002', 'DIST001', 'Midland Elementary School', 'Elementary', '1900 W Illinois Ave, Midland, TX', 'Carla Nguyen', '432-570-4610')
ON CONFLICT (school_id) DO NOTHING;

INSERT INTO parents_guardians (parent_id, first_name, last_name, relationship, phone, email, address) VALUES
('PAR001', 'Karen', 'Smith', 'Mother', '432-555-0101', 'karen.smith@example.com', '210 Cotton Flat Rd, Midland, TX'),
('PAR002', 'Linda', 'Jones', 'Mother', '432-555-0102', 'linda.jones@example.com', '340 W Loop 250, Midland, TX'),
('PAR003', 'Marcus', 'Allen', 'Father', '432-555-0103', 'marcus.allen@example.com', '712 Neely Ave, Midland, TX')
ON CONFLICT (parent_id) DO NOTHING;

INSERT INTO students (student_id, student_number, first_name, last_name, grade_level, school_id, home_address, parent_id, status) VALUES
('STU001', 'STU-335667', 'John', 'Smith', '9', 'SCH001', '210 Cotton Flat Rd, Midland, TX', 'PAR001', 'ACTIVE'),
('STU002', 'STU-335668', 'Sarah', 'Jones', '9', 'SCH001', '340 W Loop 250, Midland, TX', 'PAR002', 'ACTIVE'),
('STU003', 'STU-335669', 'David', 'Allen', '9', 'SCH001', '712 Neely Ave, Midland, TX', 'PAR003', 'ACTIVE')
ON CONFLICT (student_id) DO NOTHING;

INSERT INTO drivers (driver_id, employee_number, first_name, last_name, license_number, phone, email, hire_date, certification_status, background_check_status) VALUES
('DRV001', 'EMP-10024', 'Michael', 'Johnson', 'TXCDL-88213', '432-555-0200', 'mjohnson@midlandisd.org', '2019-08-01', 'CERTIFIED', 'CLEARED'),
('DRV002', 'EMP-10031', 'Mary', 'Walter', 'TXCDL-88250', '432-555-0201', 'mwalter@midlandisd.org', '2021-01-15', 'CERTIFIED', 'CLEARED')
ON CONFLICT (driver_id) DO NOTHING;

INSERT INTO buses (bus_id, bus_number, vehicle_vin, license_plate, capacity, status) VALUES
('BUS24', '24', '1HVBTAAN8XH123456', 'TX-SCH-0024', 65, 'ACTIVE'),
('BUS18', '18', '1HVBTAAN8XH123457', 'TX-SCH-0018', 65, 'ACTIVE')
ON CONFLICT (bus_id) DO NOTHING;

INSERT INTO routes (route_id, route_name, district_id, school_id, start_location, end_location, scheduled_start_time, scheduled_end_time) VALUES
('RT005', 'Route 5 - North Loop', 'DIST001', 'SCH001', 'Cotton Flat Rd', 'Midland High School', '06:30', '07:30')
ON CONFLICT (route_id) DO NOTHING;

INSERT INTO route_stops (stop_id, route_id, stop_name, latitude, longitude, scheduled_time, sequence_number) VALUES
('STP001', 'RT005', 'Cotton Flat Stop', 31.9973, -102.0779, '06:45', 1),
('STP002', 'RT005', 'Loop 250 Stop', 32.0012, -102.0650, '06:52', 2),
('STP003', 'RT005', 'Neely Ave Stop', 32.0041, -102.0590, '06:58', 3)
ON CONFLICT (stop_id) DO NOTHING;

INSERT INTO student_routes (student_route_id, student_id, route_id, stop_id) VALUES
('SR001', 'STU001', 'RT005', 'STP001'),
('SR002', 'STU002', 'RT005', 'STP002'),
('SR003', 'STU003', 'RT005', 'STP003')
ON CONFLICT (student_route_id) DO NOTHING;

INSERT INTO driver_assignments (assignment_id, driver_id, bus_id, route_id, assignment_date, shift_type, start_time, end_time, status) VALUES
('DA1001', 'DRV001', 'BUS24', 'RT005', CURRENT_DATE, 'Morning', '06:00', '07:30', 'SCHEDULED')
ON CONFLICT (assignment_id) DO UPDATE SET assignment_date = EXCLUDED.assignment_date;

-- Permian Basin demo geography: Midland, Ector, Andrews, Howard, Martin,
-- Ward, Crane, and Reeves counties. Campus records are fictional demo data.
INSERT INTO counties (county_id, county_name, state, contact_name, contact_email) VALUES
('CNT002', 'Ector County', 'TX', 'Elena Torres', 'etorres@ectorcounty.example'),
('CNT003', 'Andrews County', 'TX', 'Marcus Green', 'mgreen@andrewscounty.example'),
('CNT004', 'Howard County', 'TX', 'Renee Foster', 'rfoster@howardcounty.example'),
('CNT005', 'Martin County', 'TX', 'Daniel Brooks', 'dbrooks@martincounty.example'),
('CNT006', 'Ward County', 'TX', 'Alicia Flores', 'aflores@wardcounty.example'),
('CNT007', 'Crane County', 'TX', 'Noah Bennett', 'nbennett@cranecounty.example'),
('CNT008', 'Reeves County', 'TX', 'Sofia Ramirez', 'sramirez@reevescounty.example')
ON CONFLICT (county_id) DO NOTHING;

INSERT INTO districts (district_id, district_name, county_id, address, phone, superintendent_name) VALUES
('DIST002', 'Ector County ISD', 'CNT002', '802 N Sam Houston Ave, Odessa, TX', '432-456-0000', 'Dr. Michelle Perez'),
('DIST003', 'Andrews ISD', 'CNT003', '405 NW 3rd St, Andrews, TX', '432-523-3600', 'Dr. Kevin Shaw'),
('DIST004', 'Big Spring ISD', 'CNT004', '708 E 11th Pl, Big Spring, TX', '432-264-3600', 'Dr. Patricia Cole'),
('DIST005', 'Stanton ISD', 'CNT005', '705 W Taylor St, Stanton, TX', '432-607-3700', 'Dr. Anthony Hill'),
('DIST006', 'Monahans-Wickett-Pyote ISD', 'CNT006', 'P.O. Box 1100, Monahans, TX', '432-943-2519', 'Dr. Laura Mitchell'),
('DIST007', 'Crane ISD', 'CNT007', '511 S Gaston St, Crane, TX', '432-558-1022', 'Dr. Samuel Price'),
('DIST008', 'Pecos-Barstow-Toyah ISD', 'CNT008', '1301 S Park St, Pecos, TX', '432-447-7201', 'Dr. Olivia James')
ON CONFLICT (district_id) DO NOTHING;

INSERT INTO schools (school_id, district_id, school_name, school_type, address, principal_name, phone) VALUES
('SCH003', 'DIST001', 'Legacy High School', 'High School', 'Whole Health Way, Midland, TX', 'Monica Carter', '432-689-1600'),
('SCH004', 'DIST002', 'Odessa High School', 'High School', '1301 N Dotsy Ave, Odessa, TX', 'James Porter', '432-456-0039'),
('SCH005', 'DIST002', 'Permian High School', 'High School', '1800 E 42nd St, Odessa, TX', 'Alicia Morris', '432-456-2300'),
('SCH006', 'DIST003', 'Andrews High School', 'High School', '1400 NW Ave K, Andrews, TX', 'Brandon Lee', '432-523-3640'),
('SCH007', 'DIST003', 'Andrews Middle School', 'Middle School', '101 NW Mustang Dr, Andrews, TX', 'Teresa Kim', '432-523-3650'),
('SCH008', 'DIST004', 'Big Spring High School', 'High School', '707 E 11th Pl, Big Spring, TX', 'Victor Hall', '432-264-3641'),
('SCH009', 'DIST004', 'Marcy Elementary School', 'Elementary', '2101 Wasson Rd, Big Spring, TX', 'Nina Patel', '432-264-4155'),
('SCH010', 'DIST005', 'Stanton High School', 'High School', '705 W Taylor St, Stanton, TX', 'Carlos Rivera', '432-607-3700'),
('SCH011', 'DIST006', 'Monahans High School', 'High School', '809 S Betty Ave, Monahans, TX', 'Heather Walker', '432-943-2519'),
('SCH012', 'DIST007', 'Crane High School', 'High School', '511 S Gaston St, Crane, TX', 'Brian Cooper', '432-558-1022'),
('SCH013', 'DIST008', 'Pecos High School', 'High School', '1201 S Park St, Pecos, TX', 'Maya Collins', '432-447-7201')
ON CONFLICT (school_id) DO NOTHING;

-- Three students per additional campus provide present, in-transit, and absent examples.
WITH campus(school_id, grade_level) AS (
	VALUES ('SCH002', '5'), ('SCH003', '9'), ('SCH004', '9'), ('SCH005', '9'),
				 ('SCH006', '9'), ('SCH007', '7'), ('SCH008', '9'), ('SCH009', '5'),
				 ('SCH010', '9'), ('SCH011', '9'), ('SCH012', '9'), ('SCH013', '9')
), roster AS (
	SELECT c.school_id, c.grade_level, n,
				 ROW_NUMBER() OVER (ORDER BY c.school_id, n)::int AS seq
	FROM campus c CROSS JOIN generate_series(1, 3) AS n
)
INSERT INTO parents_guardians (parent_id, first_name, last_name, relationship, phone, email, address)
SELECT 'PAR' || LPAD((100 + seq)::text, 3, '0'),
			 (ARRAY['Avery','Jordan','Riley','Cameron','Quinn','Morgan','Taylor','Parker','Reese','Drew','Casey','Jamie'])[((seq - 1) % 12) + 1],
			 (ARRAY['Garcia','Wilson','Martinez','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Moore','Clark'])[((seq - 1) % 12) + 1],
			 CASE WHEN n = 2 THEN 'Father' ELSE 'Mother' END,
			 '432-555-' || LPAD((1000 + seq)::text, 4, '0'),
			 'pb-parent-' || seq || '@example.com', sc.address
FROM roster r JOIN schools sc ON sc.school_id = r.school_id
ON CONFLICT (parent_id) DO NOTHING;

WITH campus(school_id, grade_level) AS (
	VALUES ('SCH002', '5'), ('SCH003', '9'), ('SCH004', '9'), ('SCH005', '9'),
				 ('SCH006', '9'), ('SCH007', '7'), ('SCH008', '9'), ('SCH009', '5'),
				 ('SCH010', '9'), ('SCH011', '9'), ('SCH012', '9'), ('SCH013', '9')
), roster AS (
	SELECT c.school_id, c.grade_level, n,
				 ROW_NUMBER() OVER (ORDER BY c.school_id, n)::int AS seq
	FROM campus c CROSS JOIN generate_series(1, 3) AS n
)
INSERT INTO students (student_id, student_number, first_name, last_name, grade_level, school_id, home_address, parent_id, status)
SELECT 'STU' || LPAD((100 + seq)::text, 3, '0'),
			 'PB-2026-' || LPAD(seq::text, 4, '0'),
			 (ARRAY['Avery','Jordan','Riley','Cameron','Quinn','Morgan','Taylor','Parker','Reese','Drew','Casey','Jamie'])[((seq - 1) % 12) + 1],
			 (ARRAY['Garcia','Wilson','Martinez','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Moore','Clark'])[((seq - 1) % 12) + 1],
			r.grade_level, r.school_id, sc.address,
			 'PAR' || LPAD((100 + seq)::text, 3, '0'), 'ACTIVE'
FROM roster r JOIN schools sc ON sc.school_id = r.school_id
ON CONFLICT (student_id) DO NOTHING;

-- An assigned morning route, bus, and driver for every additional campus.
WITH campus AS (
	SELECT sc.school_id, sc.school_name, sc.district_id,
				 ROW_NUMBER() OVER (ORDER BY sc.school_id)::int AS seq
	FROM schools sc WHERE sc.school_id BETWEEN 'SCH002' AND 'SCH013'
)
INSERT INTO drivers (driver_id, employee_number, first_name, last_name, license_number, phone, email, hire_date, certification_status, background_check_status, status)
SELECT 'DRV' || LPAD((100 + seq)::text, 3, '0'),
			 'PB-EMP-' || LPAD(seq::text, 3, '0'),
			 (ARRAY['Elena','Marcus','Renee','Daniel','Alicia','Noah','Sofia','Grace','Isaac','Priya','Omar','Chloe'])[((seq - 1) % 12) + 1],
			 (ARRAY['Torres','Green','Foster','Brooks','Flores','Bennett','Ramirez','Morgan','Reed','Shah','Ahmed','Price'])[((seq - 1) % 12) + 1],
			 'TXPB-' || LPAD(seq::text, 5, '0'),
			 '432-555-' || LPAD((2000 + seq)::text, 4, '0'),
			 'driver-' || seq || '@demo.infrashield.local',
			 DATE '2020-08-01' + (seq * 30), 'CERTIFIED', 'CLEARED', 'ACTIVE'
FROM campus
ON CONFLICT (driver_id) DO NOTHING;

WITH campus AS (
	SELECT sc.school_id, sc.school_name, sc.district_id,
				 ROW_NUMBER() OVER (ORDER BY sc.school_id)::int AS seq
	FROM schools sc WHERE sc.school_id BETWEEN 'SCH002' AND 'SCH013'
)
INSERT INTO buses (bus_id, bus_number, vehicle_vin, license_plate, capacity, status)
SELECT 'BUS' || LPAD((100 + seq)::text, 3, '0'),
			 LPAD((100 + seq)::text, 3, '0'),
			 '1PBDEMO' || LPAD(seq::text, 10, '0'),
			 'TX-PB-' || LPAD(seq::text, 4, '0'), 65, 'ACTIVE'
FROM campus
ON CONFLICT (bus_id) DO NOTHING;

WITH campus AS (
	SELECT sc.school_id, sc.school_name, sc.district_id,
				 ROW_NUMBER() OVER (ORDER BY sc.school_id)::int AS seq
	FROM schools sc WHERE sc.school_id BETWEEN 'SCH002' AND 'SCH013'
)
INSERT INTO routes (route_id, route_name, district_id, school_id, start_location, end_location, scheduled_start_time, scheduled_end_time)
SELECT 'RT' || LPAD((100 + seq)::text, 3, '0'),
			 school_name || ' School Route', district_id, school_id,
			 'Neighborhood pickup loop', school_name, '06:15', '07:30'
FROM campus
ON CONFLICT (route_id) DO UPDATE SET route_name = EXCLUDED.route_name;

WITH campus AS (
	SELECT sc.school_id,
				 CASE sc.school_id
					 WHEN 'SCH002' THEN 31.9973 WHEN 'SCH003' THEN 32.0300
					 WHEN 'SCH004' THEN 31.8457 WHEN 'SCH005' THEN 31.8857
					 WHEN 'SCH006' THEN 32.3187 WHEN 'SCH007' THEN 32.3187
					 WHEN 'SCH008' THEN 32.2504 WHEN 'SCH009' THEN 32.2504
					 WHEN 'SCH010' THEN 32.1293 WHEN 'SCH011' THEN 31.5943
					 WHEN 'SCH012' THEN 31.3974 WHEN 'SCH013' THEN 31.4229
				 END AS base_lat,
				 CASE sc.school_id
					 WHEN 'SCH002' THEN -102.0779 WHEN 'SCH003' THEN -102.1200
					 WHEN 'SCH004' THEN -102.3676 WHEN 'SCH005' THEN -102.3452
					 WHEN 'SCH006' THEN -102.5457 WHEN 'SCH007' THEN -102.5457
					 WHEN 'SCH008' THEN -101.4787 WHEN 'SCH009' THEN -101.4787
					 WHEN 'SCH010' THEN -101.7885 WHEN 'SCH011' THEN -102.8927
					 WHEN 'SCH012' THEN -102.3501 WHEN 'SCH013' THEN -103.4932
				 END AS base_lon,
				 ROW_NUMBER() OVER (ORDER BY sc.school_id)::int AS seq
	FROM schools sc WHERE sc.school_id BETWEEN 'SCH002' AND 'SCH013'
), stops AS (
	SELECT c.seq, c.base_lat, c.base_lon, n
	FROM campus c CROSS JOIN generate_series(1, 3) AS n
)
INSERT INTO route_stops (stop_id, route_id, stop_name, latitude, longitude, scheduled_time, sequence_number)
SELECT 'STP' || LPAD((100 + (seq - 1) * 3 + n)::text, 3, '0'),
			 'RT' || LPAD((100 + seq)::text, 3, '0'),
			 CASE n WHEN 1 THEN 'North neighborhood pickup' WHEN 2 THEN 'Community center stop' ELSE 'Campus approach stop' END,
			base_lat + (n * 0.0012),
			base_lon - (n * 0.0012),
			 TIME '06:30' + ((n - 1) * INTERVAL '7 minutes'), n
FROM stops
		ON CONFLICT (stop_id) DO UPDATE
		SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;

WITH campus AS (
	SELECT sc.school_id, ROW_NUMBER() OVER (ORDER BY sc.school_id)::int AS seq
	FROM schools sc WHERE sc.school_id BETWEEN 'SCH002' AND 'SCH013'
), ranked_students AS (
	SELECT s.student_id, s.school_id,
				 ROW_NUMBER() OVER (PARTITION BY s.school_id ORDER BY s.student_id)::int AS stop_seq
	FROM students s WHERE s.school_id BETWEEN 'SCH002' AND 'SCH013'
)
INSERT INTO student_routes (student_route_id, student_id, route_id, stop_id, status)
SELECT 'SR' || LPAD((100 + ROW_NUMBER() OVER (ORDER BY rs.school_id, rs.student_id))::text, 4, '0'),
			 rs.student_id,
			 'RT' || LPAD((100 + c.seq)::text, 3, '0'),
			 'STP' || LPAD((100 + ((c.seq - 1) * 3) + rs.stop_seq)::text, 3, '0'), 'ACTIVE'
FROM ranked_students rs JOIN campus c ON c.school_id = rs.school_id
WHERE rs.stop_seq <= 3
ON CONFLICT (student_route_id) DO NOTHING;

WITH campus AS (
	SELECT sc.school_id, ROW_NUMBER() OVER (ORDER BY sc.school_id)::int AS seq
	FROM schools sc WHERE sc.school_id BETWEEN 'SCH002' AND 'SCH013'
)
INSERT INTO driver_assignments (assignment_id, driver_id, bus_id, route_id, assignment_date, shift_type, start_time, end_time, status)
SELECT 'DA' || LPAD((1100 + seq)::text, 4, '0'),
			 'DRV' || LPAD((100 + seq)::text, 3, '0'),
			 'BUS' || LPAD((100 + seq)::text, 3, '0'),
			 'RT' || LPAD((100 + seq)::text, 3, '0'),
			 CURRENT_DATE, 'Morning', '06:00', '07:30', 'SCHEDULED'
FROM campus
ON CONFLICT (assignment_id) DO UPDATE SET assignment_date = EXCLUDED.assignment_date;

-- Today's demo attendance: one transported, one in transit, one absent per campus.
WITH ranked_students AS (
	SELECT s.student_id, s.school_id,
				 ROW_NUMBER() OVER (PARTITION BY s.school_id ORDER BY s.student_id)::int AS roster_seq
	FROM students s
), demo_events AS (
	SELECT s.student_id, s.roster_seq, sr.route_id, sr.stop_id, a.bus_id, a.driver_id
	FROM ranked_students s
	JOIN student_routes sr ON sr.student_id = s.student_id
	JOIN driver_assignments a ON a.route_id = sr.route_id AND a.assignment_date = CURRENT_DATE
	WHERE s.roster_seq <= 2
)
INSERT INTO attendance_events (event_id, student_id, bus_id, driver_id, route_id, stop_id, board_time, drop_off_time, verification_method, verification_score, attendance_status)
SELECT 'EV' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || 'D' || student_id,
			 student_id, bus_id, driver_id, route_id, stop_id,
			 CURRENT_DATE + TIME '07:05' + ((roster_seq - 1) * INTERVAL '4 minutes'),
			 CASE WHEN roster_seq = 1 THEN CURRENT_DATE + TIME '07:48' ELSE NULL END,
			 'ID_CARD', 98.5,
			 CASE WHEN roster_seq = 1 THEN 'PRESENT_TRANSPORTED' ELSE 'BOARDED' END
FROM demo_events
ON CONFLICT (event_id) DO NOTHING;

-- Complete the demo fleet at 20 drivers (13 morning drivers plus 7 afternoon drivers).
INSERT INTO drivers (driver_id, employee_number, first_name, last_name, license_number, phone, email, hire_date, certification_status, background_check_status, status) VALUES
('DRV113', 'PB-EMP-013', 'Mia', 'Sanders', 'TXPB-00013', '432-555-3013', 'driver-13@demo.infrashield.local', '2020-10-01', 'CERTIFIED', 'CLEARED', 'ACTIVE'),
('DRV114', 'PB-EMP-014', 'Ethan', 'Cruz', 'TXPB-00014', '432-555-3014', 'driver-14@demo.infrashield.local', '2020-11-01', 'CERTIFIED', 'CLEARED', 'ACTIVE'),
('DRV115', 'PB-EMP-015', 'Isabel', 'Reyes', 'TXPB-00015', '432-555-3015', 'driver-15@demo.infrashield.local', '2021-01-01', 'CERTIFIED', 'CLEARED', 'ACTIVE'),
('DRV116', 'PB-EMP-016', 'Logan', 'Price', 'TXPB-00016', '432-555-3016', 'driver-16@demo.infrashield.local', '2021-02-01', 'CERTIFIED', 'CLEARED', 'ACTIVE'),
('DRV117', 'PB-EMP-017', 'Natalie', 'Ward', 'TXPB-00017', '432-555-3017', 'driver-17@demo.infrashield.local', '2021-03-01', 'CERTIFIED', 'CLEARED', 'ACTIVE'),
('DRV118', 'PB-EMP-018', 'Gabriel', 'Ross', 'TXPB-00018', '432-555-3018', 'driver-18@demo.infrashield.local', '2021-04-01', 'CERTIFIED', 'CLEARED', 'ACTIVE')
ON CONFLICT (driver_id) DO NOTHING;

-- Seven afternoon assignments use alternate drivers; the remaining six routes
-- use their morning driver for the return trip.
INSERT INTO driver_assignments (assignment_id, driver_id, bus_id, route_id, assignment_date, shift_type, start_time, end_time, status) VALUES
('DA1201', 'DRV002', 'BUS24', 'RT005', CURRENT_DATE, 'Afternoon', '14:00', '16:00', 'SCHEDULED'),
('DA1202', 'DRV113', 'BUS101', 'RT101', CURRENT_DATE, 'Afternoon', '14:00', '16:00', 'SCHEDULED'),
('DA1203', 'DRV114', 'BUS102', 'RT102', CURRENT_DATE, 'Afternoon', '14:00', '16:00', 'SCHEDULED'),
('DA1204', 'DRV115', 'BUS103', 'RT103', CURRENT_DATE, 'Afternoon', '14:00', '16:00', 'SCHEDULED'),
('DA1205', 'DRV116', 'BUS104', 'RT104', CURRENT_DATE, 'Afternoon', '14:00', '16:00', 'SCHEDULED'),
('DA1206', 'DRV117', 'BUS105', 'RT105', CURRENT_DATE, 'Afternoon', '14:00', '16:00', 'SCHEDULED'),
('DA1207', 'DRV118', 'BUS106', 'RT106', CURRENT_DATE, 'Afternoon', '14:00', '16:00', 'SCHEDULED')
ON CONFLICT (assignment_id) DO UPDATE
SET assignment_date = EXCLUDED.assignment_date, driver_id = EXCLUDED.driver_id;

-- Add students 4–50 at each of the 13 campuses (the original first three IDs are preserved).
WITH campus(school_id, grade_level, second_grade) AS (
	VALUES ('SCH001', '9', '10'), ('SCH002', '5', NULL), ('SCH003', '9', '10'),
				 ('SCH004', '9', '10'), ('SCH005', '9', '10'), ('SCH006', '9', '10'),
				 ('SCH007', '7', '8'), ('SCH008', '9', '10'), ('SCH009', '5', NULL),
				 ('SCH010', '9', NULL), ('SCH011', '9', NULL), ('SCH012', '9', NULL),
				 ('SCH013', '9', NULL)
), ranked_campus AS (
	SELECT c.*, ROW_NUMBER() OVER (ORDER BY c.school_id)::int AS school_seq
	FROM campus c
), roster AS (
	SELECT c.*, student_no, (school_seq * 1000 + student_no)::int AS record_seq
	FROM ranked_campus c CROSS JOIN generate_series(4, 50) AS student_no
)
INSERT INTO parents_guardians (parent_id, first_name, last_name, relationship, phone, email, address)
SELECT 'PAR' || LPAD(record_seq::text, 6, '0'),
			(ARRAY['Avery','Jordan','Riley','Cameron','Quinn','Morgan','Taylor','Parker','Reese','Drew','Casey','Jamie'])[((record_seq - 1) % 12) + 1],
			(ARRAY['Garcia','Wilson','Martinez','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Moore','Clark'])[((record_seq - 1) % 12) + 1] || ' ' || LPAD(student_no::text, 2, '0'),
			 CASE WHEN student_no % 2 = 0 THEN 'Mother' ELSE 'Father' END,
			 '432-555-' || LPAD((3000 + ((record_seq * 17) % 6999))::text, 4, '0'),
			 'pb-family-' || record_seq || '@example.com', sc.address
FROM roster r JOIN schools sc ON sc.school_id = r.school_id
ON CONFLICT (parent_id) DO NOTHING;

WITH campus(school_id, grade_level, second_grade) AS (
	VALUES ('SCH001', '9', '10'), ('SCH002', '5', NULL), ('SCH003', '9', '10'),
				 ('SCH004', '9', '10'), ('SCH005', '9', '10'), ('SCH006', '9', '10'),
				 ('SCH007', '7', '8'), ('SCH008', '9', '10'), ('SCH009', '5', NULL),
				 ('SCH010', '9', NULL), ('SCH011', '9', NULL), ('SCH012', '9', NULL),
				 ('SCH013', '9', NULL)
), ranked_campus AS (
	SELECT c.*, ROW_NUMBER() OVER (ORDER BY c.school_id)::int AS school_seq
	FROM campus c
), roster AS (
	SELECT c.*, student_no, (school_seq * 1000 + student_no)::int AS record_seq
	FROM ranked_campus c CROSS JOIN generate_series(4, 50) AS student_no
)
INSERT INTO students (student_id, student_number, first_name, last_name, grade_level, school_id, home_address, parent_id, status)
SELECT 'STU' || LPAD(record_seq::text, 6, '0'),
			 'PB-2026-' || LPAD(record_seq::text, 6, '0'),
			 (ARRAY['Avery','Jordan','Riley','Cameron','Quinn','Morgan','Taylor','Parker','Reese','Drew','Casey','Jamie'])[((record_seq - 1) % 12) + 1],
			 (ARRAY['Garcia','Wilson','Martinez','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Moore','Clark'])[((record_seq - 1) % 12) + 1] || ' ' || LPAD(student_no::text, 2, '0'),
			 CASE WHEN second_grade IS NOT NULL AND student_no > 25 THEN second_grade ELSE grade_level END,
			 r.school_id, sc.address, 'PAR' || LPAD(record_seq::text, 6, '0'), 'ACTIVE'
FROM roster r JOIN schools sc ON sc.school_id = r.school_id
ON CONFLICT (student_id) DO UPDATE
SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
	grade_level = EXCLUDED.grade_level, home_address = EXCLUDED.home_address,
	parent_id = EXCLUDED.parent_id, status = EXCLUDED.status;

-- Link the additional students to their campus route and assigned pickup stop.
WITH campus AS (
	SELECT sc.school_id, ROW_NUMBER() OVER (ORDER BY sc.school_id)::int AS school_seq
	FROM schools sc
), roster AS (
	SELECT c.school_id, c.school_seq, student_no,
				 (c.school_seq * 1000 + student_no)::int AS record_seq,
				 ((student_no - 1) % 3 + 1)::int AS stop_seq
	FROM campus c CROSS JOIN generate_series(4, 50) AS student_no
)
INSERT INTO student_routes (student_route_id, student_id, route_id, stop_id, status)
SELECT 'SRX' || LPAD(record_seq::text, 6, '0'),
			 'STU' || LPAD(record_seq::text, 6, '0'),
			 CASE WHEN school_id = 'SCH001' THEN 'RT005' ELSE 'RT' || LPAD((99 + school_seq)::text, 3, '0') END,
			 CASE WHEN school_id = 'SCH001' THEN 'STP' || LPAD(stop_seq::text, 3, '0')
						ELSE 'STP' || LPAD((100 + ((school_seq - 2) * 3) + stop_seq)::text, 3, '0') END,
			 'ACTIVE'
FROM roster
ON CONFLICT (student_route_id) DO NOTHING;

-- Create a morning and afternoon run for every route. Seven afternoon routes
-- use alternate drivers; all other afternoon runs reuse that route's morning driver.
WITH morning AS (
	SELECT DISTINCT ON (route_id) * FROM driver_assignments
	WHERE assignment_date = CURRENT_DATE AND shift_type = 'Morning'
	ORDER BY route_id, start_time
), afternoon AS (
	SELECT DISTINCT ON (route_id) * FROM driver_assignments
	WHERE assignment_date = CURRENT_DATE AND shift_type = 'Afternoon'
	ORDER BY route_id, start_time
), trip_rows AS (
	SELECT m.route_id, m.bus_id, m.driver_id, m.assignment_id, 'MORNING'::text AS direction
	FROM morning m
	UNION ALL
	SELECT m.route_id, COALESCE(a.bus_id, m.bus_id), COALESCE(a.driver_id, m.driver_id),
				 COALESCE(a.assignment_id, m.assignment_id), 'AFTERNOON'::text
	FROM morning m LEFT JOIN afternoon a ON a.route_id = m.route_id
)
INSERT INTO bus_trips (trip_id, assignment_id, route_id, bus_id, driver_id, service_date, direction, status, started_at, completed_at)
SELECT 'TRIP' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '_' || route_id || '_' || direction,
			 assignment_id, route_id, bus_id, driver_id, CURRENT_DATE, direction,
			 CASE WHEN direction = 'MORNING' THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,
			 CASE WHEN direction = 'MORNING' THEN CURRENT_DATE + TIME '06:00' ELSE NOW() - INTERVAL '15 minutes' END,
			 CASE WHEN direction = 'MORNING' THEN CURRENT_DATE + TIME '08:00' ELSE NULL END
FROM trip_rows
ON CONFLICT (route_id, service_date, direction) DO NOTHING;

-- A small number of completed AM trips and active PM trips make the demo useful
-- immediately; the remaining students can be boarded from each driver's manifest.
WITH ranked_students AS (
	SELECT s.student_id, s.school_id,
				 ROW_NUMBER() OVER (PARTITION BY s.school_id ORDER BY s.student_id)::int AS roster_seq
	FROM students s
), selected AS (
	SELECT s.student_id, s.roster_seq, sr.route_id, sr.stop_id, bt.trip_id, bt.direction,
				 b.bus_number
	FROM ranked_students s
	JOIN student_routes sr ON sr.student_id = s.student_id
	JOIN bus_trips bt ON bt.route_id = sr.route_id AND bt.service_date = CURRENT_DATE
	JOIN buses b ON b.bus_id = bt.bus_id
	WHERE s.roster_seq <= 2
)
INSERT INTO trip_student_events (trip_event_id, trip_id, student_id, stop_id, boarded_at, dropped_off_at, verification_method, status)
SELECT 'TEV' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || CASE direction WHEN 'MORNING' THEN 'M' ELSE 'A' END || student_id,
			 trip_id, student_id, stop_id,
			 CASE WHEN direction = 'MORNING'
						THEN CURRENT_DATE + TIME '07:05' + ((roster_seq - 1) * INTERVAL '4 minutes')
						ELSE NOW() - INTERVAL '12 minutes' END,
			 CASE WHEN direction = 'MORNING'
						THEN CURRENT_DATE + TIME '07:48' + ((roster_seq - 1) * INTERVAL '4 minutes')
						ELSE NULL END,
			 'ID_CARD', CASE WHEN direction = 'MORNING' THEN 'DROPPED_OFF' ELSE 'BOARDED' END
FROM selected
ON CONFLICT (trip_id, student_id) DO NOTHING;

-- Initial afternoon GPS locations allow parents to see a demo route in motion.
INSERT INTO bus_locations (trip_id, bus_id, route_id, latitude, longitude, recorded_at)
SELECT bt.trip_id, bt.bus_id, bt.route_id,
			 stop.latitude + 0.05, stop.longitude + 0.05, NOW()
FROM bus_trips bt
JOIN LATERAL (
	SELECT latitude, longitude FROM route_stops
	WHERE route_id = bt.route_id ORDER BY sequence_number DESC LIMIT 1
) stop ON TRUE
WHERE bt.service_date = CURRENT_DATE AND bt.direction = 'AFTERNOON'
	AND NOT EXISTS (SELECT 1 FROM bus_locations bl WHERE bl.trip_id = bt.trip_id);
