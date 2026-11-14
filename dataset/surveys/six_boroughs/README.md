# Simulated surveys: six more boroughs

1,192 survey responses for 36 places, 6 each in Brent, Kensington and Chelsea, Islington,
Newham, Greenwich and Westminster.

- `simulated_surveys_6_boroughs.csv`: the responses
- `simulated_places_6_boroughs.csv`: the places
- `simulated_summary_6_boroughs.json`: the result for each place

Each row is one simulated person answering three questions about a place:
`ent` (step-free entrance), `toilet` (accessible toilet) and `lift` (lift to all floors).
Answers are `yes`, `no` or `unsure`; `lift` can also be `one` (one floor only).

An answer counts once at least two people agree and nobody disagrees. `unsure` is ignored.

The answers are made up for testing. The places are real OpenStreetMap places with no
accessibility tags, so the test data doesn't overwrite real information.
Map data © OpenStreetMap contributors (ODbL).

| Borough | Place | Surveys | Entrance | Toilet | Lift |
|---|---|---|---|---|---|
| Brent | Brent Museum | 43 | yes | yes | partly |
| Brent | The Library at Willesden Green | 36 | yes | yes | partly |
| Brent | Gladstone Park | 31 | yes | unknown | unknown |
| Brent | Fryent Country Park | 44 | yes | unknown | unknown |
| Brent | Dark Habit Coffee | 38 | yes | no | unknown |
| Brent | Paradise by way of Kensal Green | 19 | unknown | no | partly |
| Kensington and Chelsea | Ottolenghi | 40 | yes | no | unknown |
| Kensington and Chelsea | Notting Hill Gate Library | 18 | yes | no | yes |
| Kensington and Chelsea | Avondale Park | 27 | yes | unknown | unknown |
| Kensington and Chelsea | Sambourne House | 44 | yes | yes | partly |
| Kensington and Chelsea | National Army Museum | 20 | yes | unknown | yes |
| Kensington and Chelsea | Holland Park | 43 | unknown | unknown | unknown |
| Islington | Islington Central Library | 39 | yes | yes | partly |
| Islington | Arsenal Museum | 21 | yes | yes | yes |
| Islington | The Compton Arms | 32 | no | no | unknown |
| Islington | Quentin Blake Centre for Illustration | 26 | yes | unknown | yes |
| Islington | The Charterhouse | 31 | yes | unknown | yes |
| Islington | Highbury Fields | 19 | yes | unknown | unknown |
| Newham | V&A East Museum | 46 | yes | yes | partly |
| Newham | West Ham United Coffee Co. | 35 | yes | unknown | partly |
| Newham | Thames Barrier Park | 19 | yes | unknown | unknown |
| Newham | Custom House Library | 23 | yes | yes | yes |
| Newham | Starbucks Excel | 21 | yes | unknown | partly |
| Newham | West Ham Park | 29 | yes | unknown | unknown |
| Greenwich | The Fan Museum | 45 | yes | yes | partly |
| Greenwich | Charlton Park | 30 | yes | unknown | unknown |
| Greenwich | Queen's Gardens Toilets | 31 | yes | no | unknown |
| Greenwich | Eltham Library | 41 | yes | yes | yes |
| Greenwich | Cutty Sark Café | 46 | yes | no | unknown |
| Greenwich | Old Royal Naval College Visitor Centre | 40 | yes | unknown | yes |
| Westminster | Victoria Library | 38 | yes | no | yes |
| Westminster | The Café at Foyles | 20 | yes | unknown | partly |
| Westminster | Handel & Hendrix | 45 | yes | unknown | yes |
| Westminster | The Regent's Park | 28 | yes | unknown | unknown |
| Westminster | Hunterian Museum | 39 | yes | unknown | yes |
| Westminster | Apsley House | 45 | yes | yes | partly |
