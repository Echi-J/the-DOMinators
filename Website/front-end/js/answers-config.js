/*
 * answers-config.js — where Mapper answers are shared.
 *
 * Answers go to an MQTT broker (the kind we used in the CASA0017 MQTT workshop), as
 * "retained" messages, so the broker keeps the latest answer from each device and hands
 * them all to anyone who opens the map. No sign-up, no server of our own to run.
 *
 * Fill in `url` with the broker's WebSocket address (browsers can't use plain MQTT).
 * Ask the module team for CASA's: it looks like  wss://<host>:<port>  (sometimes ending /mqtt).
 * Leave `url` empty and the map still works, keeping answers on each device only.
 *
 * The username and password are visible to anyone who opens the page's code. That's fine for
 * a coursework prototype, but use a login made only for this project, never your own UCL one.
 */
window.ACCESS_ANSWERS = {
  url: '',
  username: '',
  password: '',
  // Every message lives under this topic. Change v1 to v2 to start again with no answers.
  topic: 'student/CASA0017/dominators/access-london/v1'
};
