# 1 Introduction

## 1.1 Background

According to the 2021 Census, approximately 1.16 million London residents were disabled (Greater London Authority, 2026). For wheelchair users and people with reduced mobility, planning a visit may require information about entrances, toilets and conditions along the route. However, Transport for All found that 46% of disabled respondents in England experienced difficulty finding information in advance for walking or wheeling journeys (Johnson et al., 2023, p. 28). Research examining 212 urban rail systems worldwide also identified unclear or insufficient accessibility information, particularly about station surroundings and transfers (Ferreira et al., 2020). These findings highlight the importance of information that helps people assess both their destination and the journey, while recognising that accessibility needs vary between individuals.

## 1.2 Motivation

Access London developed from the team's interest in making accessibility information easier to explore and contribute to. The project focuses on wheelchair users and people with reduced mobility in London, while allowing other residents and visitors to share observations. Existing platforms such as Wheelmap demonstrate how users can find places and contribute wheelchair accessibility ratings through a map interface (Sozialhelden, n.d.).

During data preparation, the team found that many places in the selected OpenStreetMap dataset lacked wheelchair accessibility information. OpenStreetMap specifies no default value for wheelchair access, so an absent tag cannot establish whether a place is accessible (OpenStreetMap contributors, n.d.). This distinction shaped the project: displaying existing records alone would leave many questions unanswered.

The team therefore developed two connected functions: helping visitors explore available information and enabling contributors to fill gaps or flag discrepancies. A borough overview places individual records in a wider context by showing recorded accessibility alongside data coverage. Suggested routes and street barrier reporting extend the focus beyond destinations to conditions encountered along a journey. Together, these choices connect information use with opportunities to improve it.

## 1.3 Aims and Objectives

The primary aim of Access London is to develop a web application that supports informed travel decisions for wheelchair users and people with reduced mobility in London. The objectives are:

1. To bring place information together in an interactive map, with searches and filters for relevant accessibility features.
2. To provide suggested walking and wheelchair routes, alongside information about reported street barriers.
3. To enable users to contribute observations about step-free entrances, accessible toilets and lifts, and flag discrepancies in existing records.
4. To communicate missing information and uneven data coverage through place records and a borough overview.

These objectives guide the platform towards supporting individual decisions while making the limitations of the available evidence visible.

## 1.4 Project Overview

Access London combines Visitor and Mapper modes within a map-based interface. Visitor mode supports place searches, accessibility filters and route suggestions. Mapper mode provides a short questionnaire for contributing missing accessibility information. Users can also report street barriers and discrepancies in place records. A complementary borough view summarises recorded wheelchair accessibility, withholding scores where coverage is insufficient. The application connects these interactions to stored place records and user submissions. Route suggestions and borough scores are presented with qualifications about data coverage and conditions on the ground.

## Bibliography
Ferreira, A.F., Akasaka, Y., Pinheiro, M.G. de O. and Chang, S.K.J. (2020) ‘Information as the first attribute of accessibility: A method for assessing the information provided by urban rail systems to tourists with reduced mobility’, Sustainability, 12(23), 10185. Available at: https://doi.org/10.3390/su122310185.

Greater London Authority (2026) Housing for disabled Londoners: An analysis of secondary data. Housing Research Note 12. Available at: London Datastore (Accessed: 15 November 2026).
Johnson, E., Pathania, A., Pennick, K., Stewart, M., Stickland, C. and Vogelmann, E. (2023) Are we there yet? Barriers to transport for disabled people in 2023. Transport for All. Available at: Full report (Accessed: 15 November 2026).

OpenStreetMap contributors (n.d.) Key:wheelchair. Available at: OpenStreetMap Wiki (Accessed: 15 November 2026).

Sozialhelden (n.d.) About Wheelmap. Available at: Wheelmap (Accessed: 15 November 2026).
