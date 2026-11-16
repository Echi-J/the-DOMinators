// CASA0017 L5: Run additive SQL without dropping your existing MySQL tables.
// SOURCES (added 13 Nov 2026): the course topics and W3Schools pages this code uses. They name the concept; this project's code was written by the group.
// Course: CASA0017 L5 Introduction to Node.JS; Workshop 05 (npm modules, an Express server, routes, res.json, app.listen)
// Course: CASA0017 L7 Introduction to Databases; Workshop 06 Introduction to Databases (MySQL, create tables, import data, queries, aggregation)
// W3Schools: https://www.w3schools.com/nodejs/nodejs_filesystem.asp
// W3Schools: https://www.w3schools.com/nodejs/nodejs_mysql.asp
// W3Schools: https://www.w3schools.com/js/js_errors.asp (try, catch, finally)
import { readFile } from 'node:fs/promises';
import { db } from '../back-end/db.js';
try {await db.query(await readFile(new URL('./migrations/001_barrier_reports.sql',import.meta.url),'utf8'));console.log('Barrier reports table ready (existing data retained).');} catch(e){console.error('Migration failed:',e.message);process.exitCode=1;}finally{await db.end();}
