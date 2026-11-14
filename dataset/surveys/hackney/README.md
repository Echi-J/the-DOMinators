# Simulated surveys: Hackney

200 survey responses for 6 places in Hackney.

- `simulated_surveys_hackney.csv`: the responses
- `simulated_places_hackney.csv`: the places
- `simulated_summary_hackney.json`: the result for each place

Each row is one simulated person answering three questions about a place:
`ent` (step-free entrance), `toilet` (accessible toilet) and `lift` (lift to all floors).
Answers are `yes`, `no` or `unsure`; `lift` can also be `one` (one floor only).

An answer counts once at least two people agree and nobody disagrees. `unsure` is ignored.

The answers are made up for testing. The places are real OpenStreetMap places with no
accessibility tags, so the test data doesn't overwrite real information.
Map data © OpenStreetMap contributors (ODbL).

| Place | Surveys | Entrance | Toilet | Lift |
|---|---|---|---|---|
| Petrol Station Toilets | 35 | yes | yes | partly |
| Shoreditch Park | 27 | unknown | unknown | unknown |
| 13th Floor Coffee | 47 | yes | no | partly |
| Arsenal Fruit & Veg | 39 | no | no | partly |
| Hackney Museum | 31 | yes | unknown | yes |
| Photobook cafe | 21 | yes | no | unknown |
