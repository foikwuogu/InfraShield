-- Extension seed data: teacher identities, driver availability, and
-- synthetic classroom attendance for the sample campus rosters.

INSERT INTO teachers (teacher_id, first_name, last_name, school_id, grade_level, room_number) VALUES
('TCH001', 'Rachel', 'Ortiz', 'SCH001', '9', '204')
ON CONFLICT (teacher_id) DO NOTHING;

WITH campus(school_id, grade_level) AS (
	VALUES ('SCH002', '5'), ('SCH003', '9'), ('SCH004', '9'), ('SCH005', '9'),
				 ('SCH006', '9'), ('SCH007', '7'), ('SCH008', '9'), ('SCH009', '5'),
				 ('SCH010', '9'), ('SCH011', '9'), ('SCH012', '9'), ('SCH013', '9')
), ranked AS (
	SELECT c.school_id, c.grade_level,
				 ROW_NUMBER() OVER (ORDER BY c.school_id)::int AS seq
	FROM campus c
)
INSERT INTO teachers (teacher_id, first_name, last_name, school_id, grade_level, room_number)
SELECT 'TCH' || LPAD((100 + seq)::text, 3, '0'),
			 (ARRAY['Elena','Marcus','Renee','Daniel','Alicia','Noah','Sofia','Grace','Isaac','Priya','Omar','Chloe'])[((seq - 1) % 12) + 1],
			 (ARRAY['Torres','Green','Foster','Brooks','Flores','Bennett','Ramirez','Morgan','Reed','Shah','Ahmed','Price'])[((seq - 1) % 12) + 1],
			 school_id, grade_level, (200 + seq)::text
FROM ranked
ON CONFLICT (teacher_id) DO NOTHING;

UPDATE teachers
SET email = CASE teacher_id
	WHEN 'TCH001' THEN 'rachel.ortiz@midlandisd.example'
	ELSE LOWER('teacher.' || teacher_id || '@demo.infrashield.local')
END
WHERE email IS NULL;

INSERT INTO teachers (teacher_id, first_name, last_name, school_id, grade_level, room_number) VALUES
('TCH113', 'Monica', 'Carter', 'SCH001', '10', '310'),
('TCH114', 'Javier', 'Lopez', 'SCH003', '10', '310'),
('TCH115', 'Diana', 'Brooks', 'SCH004', '10', '310'),
('TCH116', 'Peter', 'Adams', 'SCH005', '10', '310'),
('TCH117', 'Sonia', 'Patel', 'SCH006', '10', '310'),
('TCH118', 'Evan', 'Kim', 'SCH007', '8', '208'),
('TCH119', 'Lydia', 'Price', 'SCH008', '10', '310')
ON CONFLICT (teacher_id) DO NOTHING;

INSERT INTO driver_availability (driver_id, status) VALUES
('DRV001', 'AVAILABLE'),
('DRV002', 'AVAILABLE')
ON CONFLICT (driver_id) DO NOTHING;

INSERT INTO driver_availability (driver_id, status)
SELECT driver_id, 'AVAILABLE'
FROM drivers
ON CONFLICT (driver_id) DO NOTHING;

WITH eligible_students AS (
	SELECT s.student_id, s.grade_level, s.school_id,
				 ROW_NUMBER() OVER (PARTITION BY s.school_id ORDER BY s.student_id)::int AS roster_seq
	FROM students s
), classroom_roster AS (
	SELECT s.student_id,
				 CASE
					 WHEN s.school_id = 'SCH001' AND s.grade_level = '10' THEN 'TCH113'
					 WHEN s.school_id = 'SCH003' AND s.grade_level = '10' THEN 'TCH114'
					 WHEN s.school_id = 'SCH004' AND s.grade_level = '10' THEN 'TCH115'
					 WHEN s.school_id = 'SCH005' AND s.grade_level = '10' THEN 'TCH116'
					 WHEN s.school_id = 'SCH006' AND s.grade_level = '10' THEN 'TCH117'
					 WHEN s.school_id = 'SCH007' AND s.grade_level = '8' THEN 'TCH118'
					 WHEN s.school_id = 'SCH008' AND s.grade_level = '10' THEN 'TCH119'
					 ELSE primary_teacher.teacher_id
				 END AS teacher_id,
				 s.roster_seq
	FROM eligible_students s
	JOIN LATERAL (
		SELECT t.teacher_id FROM teachers t
		WHERE t.school_id = s.school_id AND t.grade_level = s.grade_level
		ORDER BY t.teacher_id LIMIT 1
	) primary_teacher ON TRUE
)
INSERT INTO class_attendance (student_id, attendance_date, status, marked_by, note, marked_at)
SELECT student_id, CURRENT_DATE,
			 CASE WHEN roster_seq % 17 = 0 THEN 'ABSENT'
						WHEN roster_seq % 13 = 0 THEN 'LATE'
						WHEN roster_seq % 19 = 0 THEN 'EXCUSED'
						ELSE 'PRESENT' END,
			 teacher_id,
			 CASE WHEN roster_seq % 17 = 0 THEN 'Demo: family-reported absence'
						WHEN roster_seq % 13 = 0 THEN 'Demo: arrived after the bell'
						WHEN roster_seq % 19 = 0 THEN 'Demo: excused absence' ELSE NULL END,
			 NOW()
FROM classroom_roster
ON CONFLICT (student_id, attendance_date) DO UPDATE
SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by,
		note = EXCLUDED.note, marked_at = EXCLUDED.marked_at;
