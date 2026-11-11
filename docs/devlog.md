# Access London: development log

The DOMinators, CASA0017 Web Architecture, UCL CASA. Due 16 November 2026.

Where each entry comes from:

- **[repo]**: the GitHub commit history of `Echi-J/the-DOMinators`
- **[team]**: decisions the team made in meetings and chat
- **[Namita]**: Namita's map and design work, which was built with Claude (AI). That AI use is recorded in our AI-use log (Category 3).

Dates are 2026 unless stated.

---

## October: choosing the project [team]

- **First idea, The Performance Gap:** whether London public buildings use more energy than similar ones (energy certificates, a map of London, then a dashboard for each building).
- **Other ideas discussed:** Talkwise, and "the butterfly". The butterfly was dropped because it had no real use case. The module asks for a real problem, solved with existing data, visualisation and a website.
- **Next:** accessible routes for wheelchair users (step-free routes, accessible toilets, ramps), then a cycling-safety route picker.
- **Settled on an accessibility rating site, not a route finder:**
  - London's 33 boroughs, each scored 0–100 on how easy places are to get into
  - two screens: a map for disabled visitors, and a contributor map showing where access information is missing, in its own colours
  - all data from real sources, nothing made up
- **The professors approved the pitch.** The project became **Access London**.

## Roles [team]

- **Namita Senthil Kumaran:** visual design, the map screens
- **Xinrui Li:** data pipeline and back-end deployment
- **Mengjiao Zhao:** toilet dataset
- **Aubree:** back-end
- **Zhaoji Huang:** the "two people must agree" rule for crowd answers

## The repository [repo]

- **2020–2024, Steven Gray:** the module's starting repository (initial upload and README updates).

## 3 November [repo]

- **Namita** added the project README:
  - what the site does: Visitor and Mapper modes, the borough tile map, place cards, the three-question Mapper flow, two people must agree
  - the planned stack: MapLibre and OpenFreeMap, Express API, MySQL, Python data pipeline
  - the research question: *is accessibility information missing where disabled Londoners live?*
- **Namita** created `docs/devlog.md` (this file) and added the design screenshots: `home-demo.gif`, `map-boroughs.png`, `map-place.png`, `map-mapper-question.png`, `phone.png`.

## 4 November [repo]

- **Namita** made a small README fix.

## 5 November [repo]

- **Mengjiao** added the London toilets dataset in `dataset/toilets/`:
  - toilets with review fields (GeoJSON and CSV), a summary for each borough, a field dictionary, a quality report and a source manifest

## 6 November [repo]

- **Pull request #1 (`data/runtime-datasets-20261106`):** the first data the website runs on. Merged by Xinrui; the commits are by the account "e".
  - OpenStreetMap places for all 33 boroughs (`Website/data/places/`), with borough boundaries, a catalogue, a UI config and attribution
  - TfL station data (`Website/data/tfl/`)
  - OpenStreetMap facility evidence (`Website/data/venue_evidence/`): entrances, ramps and lifts

## 8 November [repo]

- **Pull request #2 (`data/integrated-sources-20261108`), Xinrui:**
  - **Toilet coverage:** The Toilet Map, 1,921 London toilets, 876 marked accessible (`Website/data/toiletmap/`), and refreshed TfL snapshots
  - **Website and back-end:**
    - pages: home, map, access, how-to-use, observations, about, contact, 404
    - a Next.js back-end deployed on Cloudflare, with a D1 database
    - `/api/observations`: sign in with ChatGPT, an evidence link for each answer, reviewer approval
    - `/api/reviews`
    - deployed at `access-london-data-20261103.dbibd.chatgpt.site`
  - **Reproducible refresh scripts** (`dataset/scripts/additional/`), the TfL station, platform and toilet tables, and a survey review queue (100 planned Bexley tasks, none done yet)
- **Pull request #3 (`fix/access-need-filters-20261108`), Xinrui:** connected entrance evidence to the access filters on the map, index, observations and how-to-use pages.

---

## Map redesign: before 11 November [Namita, built with Claude]

The website on `main` worked, but it didn't match the agreed design.

Problems Namita listed:

1. saving an answer needed a login
2. every answer needed a form with an evidence link
3. the map interface was heavy
4. the design needed work

The redesign kept Xinrui's data as the source for everything.

**Data, made smaller for the browser:** Node scripts in `dataset/scripts/map/`; the team asked for no Python in project code.

- `places-slim/`: each borough's places, 6 fields each
- `places-detail/`: address, opening hours and website, loaded only when a place opens
- `boundaries/`, `boroughs-map.json`, `search-index.json` and `stations-slim.json`
- **69,891 places** across all 33 boroughs, from the 18 October OpenStreetMap snapshot. **About 3 in 4 have no wheelchair tag.**

**Map page (`map.html`):** built on the team's mockup template.

- **London view:** borough outlines that glide into a borough when picked.
- **Pins:**
  - icon pins for each kind of place, with depth and a ground shadow so they stand out from the basemap
  - green means yes, dashed means not known (never shown as "no"), grey means no or partly
  - a pin grows 4× on hover
- **Place card, answer first:** the answer to "can I get in?" comes first, then directions, save and share.
- **"Go to this place" page:** distance, the nearest step-free stations, and links to Google Maps and TfL.
- **Finding places:** search across boroughs and places, filters that combine several kinds of place, and a 3D buildings view.
- **Map controls:** a collapsible panel for a map-only view, smooth zoom, and "Use my location".
- **Mapper mode:**
  - the gaps in terracotta
  - three questions, one per screen, with "Not sure" always allowed
  - "Something was different" reports
- **Bugs fixed:**
  - a blank patch over the map on phones (Chromium drawing bug, fixed with an inner scroller)
  - a black outline on the search box
  - hover stuck after switching mode
  - a broken trip view after "Use my location"
  - pages failing when opened as a file instead of through a local server

**Home and About pages:**

- a floating header with Visitor/Mapper, a logo, and an animated Visitor/Mapper "film" with a pause button
- an About page with the pin key, the score formula, data sources, limits and contact

**User testing:** Namita sent the site to a few friends and fixed the UX problems and bugs they found.

## 11 November [Namita, built with Claude]

- **Shared Mapper answers with no sign-up.** This replaces login plus evidence plus reviewer for Mapper answers.
  - Answers go to an MQTT broker as retained messages, one for each device and place, and every open map listens.
  - **Rule:** an answer shows for everyone when two different devices give the same answer and nobody disagrees. "Not sure" doesn't count.
  - One answer shows "Needs 1 more" in light orange.
  - **Tested with a local broker:** two devices confirmed a place, a Visitor page that was already open updated live, and a new Visitor saw it on opening.
  - The broker address isn't set yet (`js/answers-config.js`). Until it is, answers stay on the device that gave them.
  - `export-answers.mjs` backs up all answers to a JSON file.
  - **Known limits:**
    - the broker login is public
    - one person can pose as two devices
    - Xinrui's back-end (sign-in, evidence, reviewer) remains the stronger option and stays in the repo
- **New home page:** the whole first screen is an illustrated map.
  - In the Visitor story, a wheelchair user travels to a museum and its card appears.
  - In the Mapper story, the gaps light up and the museum gets its first answer.
  - Real borough tiles: only 9 of 33 boroughs have enough checked places for a score; the rest show dashed.
- **Team message (Slack, 10:00):** Namita proposed replacing the old front-end and asked the team to review.
- **One-site plan (`MERGE.md`):**
  - remove the old front-end pages
  - keep Xinrui's back-end, all of `Website/data`, and `front-end/js/tfl-feed.mjs`, which her server imports
  - work on the branch `namita/one-site` and send it to the team as a pull request
- **New data from files already in the repo:**
  - `stations-detail.json`: 432 London stations with the step and gap between platform and train for each platform, renamed lines (Elizabeth line, IFS Cloud Cable Car)
  - `toilets.json`: The Toilet Map, slimmed for the map
- **Next-version brief for Claude Design** (`PROMPT.md`):
  - a scroll story below the first screen
  - station pins and cards with live lift status
  - Toilet Map toilets, bus stops, National Rail–only stations
  - new building kinds: universities and colleges, health, culture; schools shown only as labels
  - the About page update
- **Hosting decision:** fork to Namita's GitHub, test on GitHub Pages from the fork, then open a pull request to the team repo. The team agrees one submission link.

---

## Still open

- [ ] Team agreement on the one-site pull request
- [ ] MQTT broker WebSocket address (`wss://`) and a project-only login, from the module team
- [ ] Download bus stops and National Rail stations (NaPTAN) and the new buildings (OpenStreetMap); the scripts run on a laptop
- [ ] Stations on the map, with live lift status
- [ ] Scroll story on the home page
- [ ] One submission link agreed: team repo Pages, Namita's fork, or Xinrui's deployment
- [ ] AI-use log brought up to date
- [ ] Feature freeze: Thursday 12 November, 18:00
- [ ] Submission: Monday 16 November
