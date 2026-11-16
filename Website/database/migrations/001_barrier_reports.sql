-- Additive migration: do NOT rerun db:setup; preserve all POI and Mapper data.
-- SOURCES (added 13 Nov 2026): the course topics and W3Schools pages this code uses. They name the concept; this project's code was written by the group.
-- Course: CASA0017 L7 Introduction to Databases; Workshop 06 Introduction to Databases (MySQL, create tables, import data, queries, aggregation)
-- W3Schools: https://www.w3schools.com/sql/sql_create_table.asp
-- W3Schools: https://www.w3schools.com/sql/sql_quickref.asp (CREATE INDEX)
CREATE TABLE IF NOT EXISTS barrier_reports (
  id CHAR(36) PRIMARY KEY,
  lon DECIMAL(10,7) NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  type ENUM('blocked_pavement','uneven_surface','step_or_kerb','narrow_passage','other','unspecified') NOT NULL,
  note VARCHAR(400) NOT NULL DEFAULT '',
  photo_bytes MEDIUMBLOB NULL,
  photo_mime VARCHAR(40) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  reviewed_at DATETIME NULL,
  INDEX barrier_status_created (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
