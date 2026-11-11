# Access London: the map, for all of London

`map.html` is Namita's map mockup with the sample data and drawn streets replaced by the real thing:

- **London view:** the 33 borough tiles, coloured from Xinrui's real borough figures.
- **Borough view:** a real street map (MapLibre and OpenStreetMap), showing only the open borough, with every place from Xinrui's dataset. That's 69,891 named places across London.
- **The same panels and flows as the mockup:** Visitor list, place, Directions, "Something was different", and the Mapper "Which of these have you been to?" questions.

## What's real and what isn't

| Part | Where it comes from |
|---|---|
| Places, names, kinds | Xinrui's OpenStreetMap dataset (snapshot 18 October 2026) |
| Step-free way in | The OpenStreetMap wheelchair tag. **About three in four places don't have one**, so they show as "Not known yet" |
| Accessible toilet | The OpenStreetMap toilet tags. Most places: not known |
| Lift to other floors | Only from our surveys. OpenStreetMap data has none |
| Borough tiles: Visitor | Xinrui's `osm_wheelchair_tag_score`: of the places that are tagged, how many are step-free (partly counts as half). Only 9 boroughs have enough places checked to show a score (her rule); the other 24 show "Too few places checked" |
| Borough tiles: Mapper | Xinrui's `osm_wheelchair_unknown_pct`: the share of places with no wheelchair information (60% to 100%) |
| Hackney's six surveyed places | Zhaoji's **simulated** surveys. The panel says they're test data |
| Answers from the Mapper questions, "Something was different" | **Shared through an MQTT broker** (see "Shared answers"). A place changes for everyone when two devices give the same answer. Until a broker address is filled in, they stay on this device and the page says so |
| Save | Kept on this device only (browser storage). That's on purpose: saved places are private |
| Stations | TfL's step-free list (466 stations), not live |
| Directions | Straight-line distance plus 30%, then Google Maps or TfL for the real route |

The **Changing Places toilet** row from the mockup is left out: nothing in our data answers it, so every place would say "Not known". Add it back if we add the Changing Places register as a source.

## The pages

- **Home (`index.html`):** the whole first screen is an illustrated street map. In the Visitor story, someone in a wheelchair travels up the street to a museum and its card appears (step-free, accessible toilet). In the Mapper story, the known places shrink to dots, the gaps turn terracotta, and someone answers the first question about the same museum, which then needs one more answer. The two stories take turns every 8 seconds; the round button pauses them (WCAG 2.2.2), and with "reduce motion" on, each shows its last frame. The museum is made up. The 33 borough tiles in the corner are real (from `data/boroughs-map.json`, copied into the page so it also opens without a server) and each opens that borough: in Visitor mode darker means a higher score, and dashed means too few places checked; in Mapper mode darker means more is unknown.
- **About (`about.html`):** what the pins mean, how the borough score works, where the data comes from, what we can't tell you yet, the team, and **Contact us** (contact now lives here and in every footer, not in the top bar).
- **The top bar** on every page is just three floating pills: the logo, Visitor/Mapper, and About. There's no solid bar, so the map runs right to the top of the screen.
- **The logo** (`img/logo.svg`): a map pin with a level, step-free doorway in it.

## On the map

- **Search** finds boroughs, places in the open borough, and places anywhere in London (`data/search-index.json`, 0.9 MB compressed, only downloaded the first time someone types). Press Enter for the best match, or pick one: the map opens that borough if needed and glides to the place.
- **Kinds of place:** pick as many as you like (Food and Parks, say). "All" clears them.
- **3D** (the cube button): the map tilts and the buildings rise. Pins stand upright in 3D.
- **Pins** have a white or dark edge, so none of them blend into the map, and each one floats slightly above a soft shadow on the ground.
- **Moving to a place** is a smooth glide (MapLibre's `flyTo`), and opening a borough glides in from the whole of London. With "reduce motion" switched on, the map jumps instead.
- **Zoom** buttons zoom by one step, smoothly. There's no breadcrumb any more: the **London** button in the panel goes back to all of London.

## Map only

On a laptop, the tab on the panel's right edge (‹) hides the panel so you only see the map. The tab (›) on the left edge brings it back. Clicking a place also brings it back, because that's where the place's details are. The page remembers your choice on this device. On a phone, the handle at the top of the bottom sheet does the same job.

## Pins

- Round pins with the mockup's icons and colours:
  - Visitor: green with a cream edge means yes; cream with a dashed edge means not known yet; grey means no or partly.
  - Mapper: dashed terracotta means nobody knows yet; light orange with a dashed edge means one person answered and it needs one more; orange means you answered; small green dots mean already known.
- **Hover or open a place and its pin grows to 80 px, four times its 20 px icon,** with a soft ring around it. An open place stays big until you close it.
- Zoomed out (below zoom 14.5), places are small dots. Up close, shops and places nobody has checked stay small dots until zoom 17, so the places with answers stand out. In central boroughs, Westminster for example, showing every place as a pin buried the useful ones.

## Files

| File | What it is |
|---|---|
| `map.html` | The page: the mockup's template, and the Component that decides what to show |
| `js/dc-runtime.js` | Our page renderer (unchanged, from the repo). Its `data-dc-preserve` keeps the map's element untouched between redraws |
| `js/london-map.js` | The real map: borough-only view, pins, hover and open, "you are here", lines to stations |
| `js/map-look.js` | Basemap colours for Visitor and Mapper (from the mockup), and draws the pin pictures |
| `js/london-data.js` | Loads a borough's files; answers, distances, stations, "which borough am I in", opening hours, and things kept on this device |
| `js/answers.js` | Shared Mapper answers: sends them to the MQTT broker, listens for everyone else's, and applies the two-agree rule |
| `js/answers-config.js` | The broker address, login and topic. **The only file to edit** to switch sharing on |
| `data/boroughs-map.json` | The 33 boroughs: tile position, score, % checked, % unknown (from Xinrui's `boroughs.json`) |
| `data/places-slim/<code>.json` | Every place in a borough, 6 fields each. Hackney is 0.49 MB, about 60 KB once the server compresses it |
| `data/places-detail/<code>.json` | Address, opening hours, website, last edit, mapper's note |
| `data/boundaries/<code>.json`, `all.json` | Borough outlines. `all.json` is only loaded for "Use my location" |
| `data/stations-slim.json`, `data/surveys_hackney_summary.json` | Stations and Hackney's simulated surveys |
| `tools/*.mjs` | Node scripts that make the data files from Xinrui's files (no Python), and `export-answers.mjs`, which backs up every shared answer to a JSON file |

## Make the data files again

From this folder, with Xinrui's `Website/data` next to it:

```bash
node tools/slim-places.mjs ../data/places data
node tools/split-boundaries.mjs ../data/borough_boundaries.geojson data/boundaries
node tools/slim-stations.mjs ../data/tfl/stations.geojson data/stations-slim.json
node tools/make-boroughs.mjs ../data/boroughs-map.json data/boroughs-map.json
node tools/make-search-index.mjs data/places-slim data/search-index.json
```

## Run it

**Don't double-click map.html.** Opened as a file (the address starts with `file://`), the browser won't let the page read its data files, and the page will say so. Use a local server instead:

- **VS Code:** install the "Live Server" extension, right-click `map.html` and choose **Open with Live Server**. The address starts with `http://127.0.0.1:5500`.
- **Terminal:** in this folder, run `npx serve`, then open the address it prints and add `/map.html`.

On GitHub Pages it works as it is, because that's a real server too.

`index.html` (home), `about.html` and `map.html` link to each other. If the team keeps its own home and about pages instead, point the logo and About links at those.

A link to `map.html#HCK` opens Hackney, and `map.html#HCK/osm:node/1558137005` opens a place. That's how Share works.

## How it fits together (so you can explain it)

1. **The renderer and the map share the page.** `dc-runtime.js` redraws the panels from the template whenever the state changes. The map can't be redrawn like that, because MapLibre owns its canvas. So its element (`#lm`) is always the first thing in `<main>` and has `data-dc-preserve`, which tells the renderer to skip it.
2. **The Component tells the map what changed** in `componentDidUpdate()`: the mode and needs (`setRule`) and which place is hovered or open (`setFocus`). The map tells the Component when a pin is clicked (`onPick`) and when the view moves (`onMove`), so the list shows the places on screen.
3. **Opening a borough** downloads three small files for it (`LondonData.loadBorough`). Then `openBorough()` covers everything outside the borough, shows its places, and stops the map being dragged away.
4. **Pin colour is worked out by the map, not stored.** `status()` in `london-map.js` is a MapLibre expression that turns each place's tags into fit, unknown or nofit for the needs you picked (or gap, answered or known for mappers). It's the same rule as `status()` in `map.html`, so the list and the pins always agree.
5. **The big pin** is a second layer (`focus-pin`) that only shows the hovered and open places, at 80/44 of the normal size. MapLibre can't resize one pin on hover by itself.
6. **Mapper answers** are sent with `Answers.send` (`js/answers.js`) and kept on the device too. Every open page listens to the borough's answers (`Answers.watch`), and `LondonData.applyCrowd` puts the confirmed ones onto the places, so pins, list and place panel all change together, without reloading.

## Shared answers (no sign-up)

Nobody signs up. A Mapper answers the three questions, and the answer is sent to an **MQTT broker**: a small message server the course already uses. Every open map listens to it.

**The rule:** a place's answer shows for everyone when **two different devices give the same answer and nobody disagrees**. "Not sure" doesn't count either way. One answer shows as "Needs 1 more" in Mapper mode, and visitors still see the old information. If two people disagree, the place stays "not known" until more people answer.

**How it works:**

- Each device gets a random id the first time (kept in browser storage). No names, no emails.
- An answer is one small message on the topic `<topic>/answers/<borough>/<place>/<device>`, for example `.../answers/E09000012/osm-node-123/k3f9x2`. Because the device is in the topic, one device can only count once per place: answering again replaces its earlier answer.
- Messages are **retained**: the broker keeps the latest one on each topic and gives them all to anyone who opens that borough. So a new visitor sees every answer so far, then live ones as they arrive.
- `answers.js` checks every message (right shape, allowed values, the place matches the topic) and ignores anything else.

**Switching it on:** edit `js/answers-config.js`:

```js
window.ACCESS_ANSWERS = {
  url: 'wss://<broker address>:<websocket port>',  // from the module team
  username: '<project login>', password: '<project password>',
  topic: 'student/CASA0017/dominators/access-london/v1'
};
```

The browser can only use MQTT **over WebSockets** (an address starting `wss://`, or `ws://` when testing locally), not the usual port 1883. Ask the module team for the WebSocket address. If the course broker can't do it, a Raspberry Pi running Mosquitto with WebSockets switched on, or a free HiveMQ Cloud broker, works the same way: only the address changes.

**Back up the answers** now and then, and before the deadline. They live on the broker, so a restart or someone clearing the topic would lose them:

```bash
npm install mqtt
node tools/export-answers.mjs wss://<broker>:<port> student/CASA0017/dominators/access-london/v1 answers-backup.json <username> <password>
```

**Limits, say these in the report:**

- **The login is public.** Anything in a web page's JavaScript can be read, so use a login made just for this project, never anyone's own UCL login. Anyone who reads it can send messages to the topic.
- **One person can pretend to be two.** Clearing browser storage gives a new device id, so the two-agree rule stops honest mistakes, not someone determined. Real protection needs sign-in or a server that checks answers, which is what Xinrui's back-end does (sign-in, evidence link, reviewer).
- **The topic is open to read**, so answers are public. They hold no personal information: a place, three answers, a random id and a time.

## Tested

In Chromium at laptop and phone size, with no errors:

- London tiles in both modes
- opening Hackney from a tile, Camden by "Use my location", Westminster by link
- the list, a place, Directions with location shared
- hovering and opening pins at four times the icon size
- the Mapper flow from "I've been" through to "You just helped someone get in"
- **shared answers**, with a test broker on this computer: the first Mapper sees "1 more answer confirms it"; a second Mapper on another device gives the same answer and sees "Confirmed"; a Visitor page that was already open changes to "Step-free way in: Yes, checked by 2 mappers who agree" without reloading; a Visitor who opens the page afterwards sees it too
- `export-answers.mjs` saving those answers to a file

**Not tested with the real course broker**: we don't have its address yet.

**Not tested:** the basemap streets and the Outfit font. Neither can be reached from where this was built, so the screenshots show our pins on a plain background. Check the street colours in your own browser.

Built with AI help (Claude). Log it in the AI-use log, and read "How it fits together" until you can explain each step.
