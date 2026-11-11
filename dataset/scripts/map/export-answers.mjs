// export-answers.mjs — saves every shared Mapper answer from the MQTT broker to a JSON file.
// Run it now and then (and before the deadline). The broker keeps answers as retained
// messages, but a broker restart without saving, or someone clearing the topic, would lose
// them: this file is your backup and the data for the report.
//
//   npm install mqtt
//   node export-answers.mjs <broker ws url> <topic> answers-backup.json [username] [password]
//   e.g. node export-answers.mjs wss://example.org:8081 student/CASA0017/dominators/access-london/v1 answers.json
import mqtt from 'mqtt';
import { writeFileSync } from 'node:fs';

const [url, topic, out = 'answers-backup.json', username, password] = process.argv.slice(2);
if (!url || !topic) { console.log('Usage: node export-answers.mjs <url> <topic> [out.json] [username] [password]'); process.exit(1); }
const answers = [];
const client = mqtt.connect(url, { username, password, connectTimeout: 10000 });
client.on('connect', () => {
  client.subscribe(topic + '/answers/#', { qos: 1 });
  // retained messages all arrive straight after subscribing; give them a few seconds
  setTimeout(() => {
    writeFileSync(out, JSON.stringify({ exported_at: new Date().toISOString(), topic, count: answers.length, answers }, null, 1));
    console.log('Saved', answers.length, 'answers to', out);
    client.end();
  }, 5000);
});
client.on('message', (t, buf) => { try { answers.push(Object.assign({ topic: t }, JSON.parse(buf.toString()))); } catch (e) { /* not ours */ } });
client.on('error', (e) => { console.error('Could not connect:', e.message); process.exit(1); });
