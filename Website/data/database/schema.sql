-- Access London: the MySQL database.
--
-- Four tables and three views:
--   boroughs   33 London boroughs: name, place on the tile map, outline, Census and IMD figures
--   places     74,500 places from OpenStreetMap, with their wheelchair and toilet tags
--   stations   466 TfL stations with their step-free type
--   answers    Mapper answers to the three questions: real people and our simulated surveys
--
--   answer_votes      every definite answer, one row per question ("Not sure" left out)
--   answer_counts     how many people gave each answer, per place and question
--   confirmed_answers the two-agree rule: at least 2 people gave the same answer and nobody disagreed
--
-- Run with:  npm run db:setup   (creates the tables, then imports the seed/ files)

-- SOURCES (added 13 Nov 2026): the course topics and W3Schools pages this code uses. They name the concept; this project's code was written by the group.
-- Course: CASA0017 L7 Introduction to Databases; Workshop 06 Introduction to Databases (MySQL, create tables, import data, queries, aggregation)
-- W3Schools: https://www.w3schools.com/sql/sql_create_table.asp
-- W3Schools: https://www.w3schools.com/sql/sql_view.asp
-- W3Schools: https://www.w3schools.com/mysql/mysql_view.asp
-- W3Schools: https://www.w3schools.com/sql/sql_groupby.asp
-- W3Schools: https://www.w3schools.com/sql/sql_having.asp
-- W3Schools: https://www.w3schools.com/sql/sql_quickref.asp (UNION ALL, PRIMARY KEY, FOREIGN KEY, INDEX)
--
DROP VIEW IF EXISTS confirmed_answers, answer_counts, answer_votes;
DROP TABLE IF EXISTS answers, stations, places, boroughs;

-- Course: CASA0017 L7 Introduction to Databases; Workshop 06 Introduction to Databases (MySQL, create tables, import data, queries, aggregation): CREATE TABLE with a PRIMARY KEY
-- W3Schools: https://www.w3schools.com/sql/sql_create_table.asp
CREATE TABLE boroughs (
  code            CHAR(9)      PRIMARY KEY,       -- official code, e.g. E09000012
  name            VARCHAR(60)  NOT NULL,          -- e.g. Hackney
  ui_code         CHAR(3)      NOT NULL,          -- short label on the tile map, e.g. HCK
  grid_row        TINYINT      NOT NULL,          -- tile position on the map of London
  grid_col        TINYINT      NOT NULL,
  disability_pct  DECIMAL(5,2),                   -- Census 2021: % of residents disabled
  imd_score       DECIMAL(6,3),                   -- Index of Multiple Deprivation 2025, average score
  boundary        JSON         NOT NULL           -- the borough outline (GeoJSON geometry)
);

-- Course: CASA0017 L7 Introduction to Databases; Workshop 06 Introduction to Databases (MySQL, create tables, import data, queries, aggregation): a FOREIGN KEY links each place to its borough
-- W3Schools: https://www.w3schools.com/sql/sql_quickref.asp
CREATE TABLE places (
  id              VARCHAR(40)  PRIMARY KEY,       -- OpenStreetMap id, e.g. osm:node/1558137005
  borough_code    CHAR(9)      NOT NULL,
  name            VARCHAR(255) NOT NULL,
  has_real_name   BOOLEAN      NOT NULL,          -- false when the name was made up from the category
  category        VARCHAR(20)  NOT NULL,          -- food, park, museum, shop, toilet
  subcategory     VARCHAR(40),                    -- cafe, pub, library... picks the pin's icon
  lon             DECIMAL(9,6) NOT NULL,
  lat             DECIMAL(9,6) NOT NULL,
  wheelchair_tag  VARCHAR(12)  NOT NULL,          -- OSM tag as it is: yes, limited, no, designated, unknown
  wheelchair      VARCHAR(8)   NOT NULL,          -- for the map: yes, partly, no, unknown
  toilet          VARCHAR(8)   NOT NULL,          -- accessible toilet: yes, partly, no, unknown
  address         VARCHAR(400),
  opening_hours   VARCHAR(400),
  website         VARCHAR(500),
  access_note     TEXT,                           -- a mapper's own words about access
  last_edited     CHAR(7),                        -- e.g. 2026-01
  FOREIGN KEY (borough_code) REFERENCES boroughs(code),
  INDEX places_borough (borough_code)
);

CREATE TABLE stations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  line_names      JSON         NOT NULL,          -- e.g. ["Victoria", "Northern"]
  step_free       VARCHAR(12)  NOT NULL,          -- TfL's words: Full, Partial, Interchange, None
  lon             DECIMAL(9,6) NOT NULL,
  lat             DECIMAL(9,6) NOT NULL
);

-- One row per person per place. Answering the same place again replaces your earlier answer,
-- so one person can never count twice.
CREATE TABLE answers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  place_id        VARCHAR(40)  NOT NULL,
  borough_code    CHAR(9)      NOT NULL,
  person          CHAR(16)     NOT NULL,          -- one-way code of the browser's random id (or survey respondent)
  ent             ENUM('yes','no','unsure'),      -- Is there a step-free way in?          NULL = not asked
  toilet          ENUM('yes','no','unsure'),      -- Is there an accessible toilet?        NULL = not asked
  lift            ENUM('yes','no','one','unsure'),-- Every floor without stairs? one = one floor only
  is_simulated    BOOLEAN      NOT NULL DEFAULT FALSE, -- TRUE for our simulated survey responses
  answered_at     DATETIME     NOT NULL,
  UNIQUE KEY one_answer_per_person (place_id, person),
  INDEX answers_borough (borough_code),
  FOREIGN KEY (place_id) REFERENCES places(id)
);

-- Every definite answer as its own row: (place, question, value). "Not sure" and NULL are left out.
-- "One floor only" counts as "partly".
-- Course: CASA0017 L7 Introduction to Databases; Workshop 06 Introduction to Databases (MySQL, create tables, import data, queries, aggregation): a VIEW built with UNION ALL
-- W3Schools: https://www.w3schools.com/sql/sql_view.asp
CREATE VIEW answer_votes AS
  SELECT place_id, borough_code, 'ent' AS question, ent AS value, is_simulated, answered_at
    FROM answers WHERE ent IN ('yes', 'no')
  UNION ALL
  SELECT place_id, borough_code, 'toilet', toilet, is_simulated, answered_at
    FROM answers WHERE toilet IN ('yes', 'no')
  UNION ALL
  SELECT place_id, borough_code, 'lift', IF(lift = 'one', 'partly', lift), is_simulated, answered_at
    FROM answers WHERE lift IN ('yes', 'no', 'one');

-- How many people gave each answer.
-- Course: CASA0017 L7 Introduction to Databases; Workshop 06 Introduction to Databases (MySQL, create tables, import data, queries, aggregation): COUNT(*) and GROUP BY, Workshop 06 "Aggregating Data"
-- W3Schools: https://www.w3schools.com/sql/sql_groupby.asp
CREATE VIEW answer_counts AS
  SELECT place_id, borough_code, question, value, COUNT(*) AS people
    FROM answer_votes
   GROUP BY place_id, borough_code, question, value;

-- The two-agree rule: a question is confirmed when only one answer was given (nobody disagreed)
-- and at least two people gave it.
-- Course: CASA0017 L7 Introduction to Databases; Workshop 06 Introduction to Databases (MySQL, create tables, import data, queries, aggregation): GROUP BY with HAVING
-- W3Schools: https://www.w3schools.com/sql/sql_having.asp
CREATE VIEW confirmed_answers AS
  SELECT place_id, borough_code, question, MIN(value) AS value, SUM(people) AS people
    FROM answer_counts
   GROUP BY place_id, borough_code, question
  HAVING COUNT(*) = 1 AND SUM(people) >= 2;
