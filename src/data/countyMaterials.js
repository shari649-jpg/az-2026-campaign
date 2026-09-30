// src/data/countyMaterials.js
//
// Everything the County Pages feature serves besides the county-party
// website links themselves. Two things live here:
//
//  1. KNOW_YOUR_RIGHTS — the DNC's "Know Your Rights" flyer, English and
//     Spanish. Identical for every county, so it appears ONCE on
//     /county-pages, not per county.
//
//  2. COUNTY_MATERIALS — per-county slate cards, keyed by county slug (the
//     same slug CountyPagesPage.jsx uses). Only counties that have given us
//     materials appear here; every other county just shows its website link.
//
// HOW TO ADD A COUNTY'S SLATE CARD
//   a) Save the county's ORIGINAL PDF, untouched, as
//        public/county-materials/<slug>/slate-card-2026.pdf
//      Do not edit, crop, or re-typeset it: the slate card's "Paid for by"
//      language is a legal requirement and must appear exactly as the
//      committee published it. The page shows the full, uncropped card.
//   b) Render each PDF page to an image (full page, no cropping), e.g.:
//        pdftoppm -r 250 -png slate-card-2026.pdf page
//      then save as WebP (quality ~90) named slate-card-2026-<lang>.webp
//      (en / es, or whatever pages the PDF has — one image per page).
//   c) Add an entry below. `pages` can have 1 or more items; the language
//      toggle only appears when there is more than one.
//   d) Slug must match the county's `slug` in CountyPagesPage.jsx.
//   e) After the election, remove or replace the entry and its files.

export const KNOW_YOUR_RIGHTS = {
  title: "Know Your Rights",
  source: "Democratic National Committee",
  hotline: { label: "1-833-336-8683", tel: "18333368683" },
  versions: [
    {
      lang: "en",
      label: "English",
      image: "/know-your-rights/know-your-rights-en.jpg",
      width: 1070,
      height: 1396,
      alt:
        "Know Your Rights flyer from the Democratic National Committee, in English. It covers general voting rights, what to do if your name is not on the voter list, language help, what to do if someone tries to stop you from voting, and immigration and law enforcement at the polls. The DNC voter protection hotline is 1-833-336-8683.",
    },
    {
      lang: "es",
      label: "Español",
      image: "/know-your-rights/know-your-rights-es.jpg",
      width: 1125,
      height: 1383,
      alt:
        "Volante Conoce Tus Derechos del Comité Nacional Demócrata, en español. Cubre los derechos generales al votar, qué hacer si tu nombre no está en la lista de votantes, asistencia con el idioma, qué hacer si alguien intenta impedirte votar, e inmigración y agentes policiales en las urnas. La línea de protección al votante del DNC es 1-833-336-8683.",
    },
  ],
};

export const COUNTY_MATERIALS = {
  apache: {
    countyName: "Apache",
    committee: "Apache County Democratic Party",
    slateCard: {
      year: 2026,
      // No PDF on file for this card (only the two page images were supplied),
      // so the viewer hides its "Open PDF" button. Add `pdf: "/county-materials/apache/slate-card-2026.pdf"` if the committee sends one.
      //
      // Two sides of one card, not two languages: `id` is what the URL
      // carries (?side=back) and `param` names that URL parameter. Mohave's
      // pages omit both and keep using ?lang= exactly as before.
      param: "side",
      pages: [
        {
          id: "front",
          lang: "en",
          label: "Front: Candidates",
          image: "/county-materials/apache/slate-card-2026-front.jpg",
          width: 800,
          height: 1303,
          alt:
            "Front of the 2026 Apache County Democratic Party Ballot Guide for the November 3, 2026 general election. Recommended Democratic candidates: Jonathan Nez for U.S. Representative, CD02; Katie Hobbs and Giles John for Governor and Lieutenant Governor; Jamescita Peshlakai for State Senate, District 6; Mae Peshlakai and Ian Teller for State Representative, District 6 (vote for two); Adrian Fontes for Secretary of State; Kris Mayes for Attorney General; Nick Mansour for State Treasurer; Teresa Leyba Ruiz for Superintendent of Public Instruction; Brian Matlock for State Mine Inspector; Clara Pratte and Jonathon Hill for Arizona Corporation Commission (vote for two); Samecita Begay for Clerk of the Superior Court; Jasmine Blackwater-Nygren for County Attorney; Jay Yellowhorse for Justice of the Peace, North Star Precinct 3; Sam Wood for Constable, North Star Precinct 3; Mike Latham for Judge of the Superior Court. For ballot propositions, see the back. Paid for by the Apache County Democratic Party, www.apachecountydems.org.",
        },
        {
          id: "back",
          lang: "en",
          label: "Back: Propositions",
          image: "/county-materials/apache/slate-card-2026-back.jpg",
          width: 800,
          height: 1303,
          alt:
            "Back of the 2026 Apache County Democratic Party Ballot Guide. Recommends NO on every ballot proposition: 141, 142, 144, 316, 317, 318, 319 and 320. Election facts: October 5 is the last day to register to vote; October 7 early voting begins and early ballots are mailed; October 23 is the last day to request an early ballot by mail; October 27 is the recommended last day to mail your ballot, and after that date return it to an official drop box or voting location; October 30 is the last day to vote early in person; November 3 is Election Day, polls open 6 a.m. to 7 p.m. Track your ballot at trackmyballot.azsos.gov. Apache County has adopted Vote Centers for 2026. Voter Protection Hotline 833-VOTE-4-AZ. Paid for by the Apache County Democratic Party, www.apachecountydems.org.",
        },
      ],
    },
  },
  cochise: {
    countyName: "Cochise",
    committee: "Cochise County Democratic Party",
    slateCard: {
      year: 2026,
      param: "page",
      pages: [
        {
          id: "congress-legislature", lang: "en", label: "Congress & Legislature",
          image: "/county-materials/cochise/slate-card-2026-congress-legislature.jpg", width: 1280, height: 2048,
          alt: "Cochise County Democratic Party 2026 midterm candidates, congress and legislature. Jo Mendoza for Congressional District 6; Adelita Grijalva for Congressional District 7; Bob Karp for LD19 State Senate; Aiden Swallow and Jackie Anderson for LD19 House of Representatives (vote for both); Rosanna Gabaldon for LD21 State Senate; Miranda Lopez and Consuelo Hernandez for LD21 House of Representatives (vote for both). More on the candidates and voting at www.cochisecodems.org.",
        },
        {
          id: "statewide", lang: "en", label: "Statewide",
          image: "/county-materials/cochise/slate-card-2026-statewide.jpg", width: 1276, height: 2048,
          alt: "Cochise County Democratic Party 2026 midterm candidates, statewide. Kris Mayes for Attorney General; Katie Hobbs and Giles for Governor and Lieutenant Governor; Adrian Fontes for Secretary of State; Nick Mansour for State Treasurer; Teresa Leyba Ruiz for Superintendent of Public Instruction; Brian Matlock for Mine Inspector; Clara Pratte and Jonathon Hill for Corporation Commission (vote for both). Vote blue up and down ballot. Paid for and authorized by the Cochise County Democrats.",
        },
      ],
    },
  },
  gila: {
    countyName: "Gila",
    committee: "Gila County Democratic Party",
    slateCard: {
      year: 2026,
      pages: [
        {
          lang: "en", label: "English",
          image: "/county-materials/gila/slate-card-2026.png", width: 1280, height: 812,
          alt: "Gila County Democratic Party 2026 Election Information and Recommendations. Federal: Jonathan Nez for U.S. House CD2; Joanna Mendoza for U.S. House CD6. State Senate: Jamescita Peshlakai, LD6; Michiel Montiel, LD7. State House: Mae Peshlakai and Ian Teller, LD6 (vote for two); Samuel Martin, LD7. Statewide: Katie Hobbs for Governor and Lieutenant Governor, Kris Mayes for Attorney General, Adrian Fontes for Secretary of State, Teresa Leyba Ruiz for Superintendent of Public Instruction, Brian Matlock for Mine Inspector, Nick Mansour for Treasurer, and Clara Pratte and Jonathon Hill for Corporation Commission (vote for two). Propositions: vote yes on Gila Community College expenditure limitation expansion (Question 425), and on the PUSD 10 bond election (Question 426); ESA voucher accountability Prop 212 was removed from the ballot by Republicans, so vote accordingly; vote no on all other statewide propositions. Check your voter status, request or track a mail-in ballot, or find your polling place at iwillvote.com. Mail by October 27; Election Day is November 3. Paid for by the Arizona Democratic Party, www.azdem.org.",
        },
      ],
    },
  },
  navajo: {
    countyName: "Navajo",
    committee: "Navajo County Democratic Committee",
    slateCard: {
      year: 2026,
      param: "page",
      pages: [
        {
          id: "ld6", lang: "en", label: "Candidates: LD 6",
          image: "/county-materials/navajo/slate-card-2026-ld6.jpg", width: 1200, height: 1800,
          alt: "Navajo County Democrats 2026 candidates for Legislative District 6. Jonathan Nez for U.S. Congress; Jamescita Peshlakai for District 6 State Senator; Mae Peshlakai and Ian Teller for District 6 State Representative (vote for both). Katie Hobbs for Governor, Adrian Fontes for Secretary of State, Kris Mayes for Attorney General, Nick Mansour for Treasurer, Teresa Leyba Ruiz for Superintendent of Public Instruction, Brian Matlock for Mine Inspector, and Clara Pratte and Jonathon Hill for Corporation Commission (vote for both). More races: vote for the Democrat on your ballot for Justice of the Peace (Krista R. Wilkinson, B.J. Little, Suzie Nelson or Michael Caruth) and Constable (Phyllis Romo, Suzanne Smith or Robert Black Jr.). Do not retain Justice John Lopez IV. Paid for by Navajo County Democratic Committee, navajocountydemocrats.org. Not authorized by any candidate or candidate's committee.",
        },
        {
          id: "ld7", lang: "en", label: "Candidates: LD 7",
          image: "/county-materials/navajo/slate-card-2026-ld7.jpg", width: 1200, height: 1800,
          alt: "Navajo County Democrats 2026 candidates for Legislative District 7. Jonathan Nez for U.S. Congress; Mike Montiel for District 7 State Senator; Sam Martin for District 7 State Representative. Katie Hobbs for Governor, Adrian Fontes for Secretary of State, Kris Mayes for Attorney General, Nick Mansour for Treasurer, Teresa Leyba Ruiz for Superintendent of Public Instruction, Brian Matlock for Mine Inspector, and Clara Pratte and Jonathon Hill for Corporation Commission (vote for both). More races: vote for the Democrat on your ballot for Justice of the Peace (Krista R. Wilkinson, B.J. Little, Suzie Nelson or Michael Caruth) and Constable (Phyllis Romo, Suzanne Smith or Robert Black Jr.). Do not retain Justice John Lopez IV. Paid for by Navajo County Democratic Committee, navajocountydemocrats.org. Not authorized by any candidate or candidate's committee.",
        },
        {
          id: "propositions", lang: "en", label: "Propositions",
          image: "/county-materials/navajo/slate-card-2026-propositions.jpg", width: 1163, height: 1800,
          alt: "Navajo County Democrats 2026 propositions. Vote NO on Props 141, 142, 144, 316, 317, 318, 319 and 320. Election dates: October 23 is the recommended last day to mail your completed ballot, after which take it to a drop box, elections office, or on November 3 a polling place; October 30 is the last day to vote early in person; November 3, vote at Vote Centers and precinct polling places 6 a.m. to 7 p.m., and all mail-in ballots must be received by 7 p.m. Paid for by Navajo County Democratic Committee, navajocountydemocrats.org. Not authorized by any candidate or candidate's committee.",
        },
        {
          id: "propositions-local", lang: "en", label: "Propositions + local",
          image: "/county-materials/navajo/slate-card-2026-propositions-local.jpg", width: 1200, height: 1800,
          alt: "Navajo County Democrats 2026 propositions including local measures. Vote NO on Props 141, 142, 144, 316, 317, 318, 319 and 320. Vote YES on Prop 455 (funds Timber Mesa Fire), Prop 456 (allows Pinetop-Lakeside to control local finances), Blue Ridge Question 1 and Blue Ridge Question 2. Election dates: October 23 is the recommended last day to mail your completed ballot; October 30 is the last day to vote early in person; November 3, vote at Vote Centers and precinct polling places 6 a.m. to 7 p.m., and all mail-in ballots must be received by 7 p.m.",
        },
      ],
    },
  },
  mohave: {
    countyName: "Mohave",
    committee: "Mohave County Democratic Central Committee",
    slateCard: {
      year: 2026,
      pdf: "/county-materials/mohave/slate-card-2026.pdf",
      pages: [
        {
          lang: "en",
          label: "English",
          image: "/county-materials/mohave/slate-card-2026-en.webp",
          width: 2125,
          height: 2750,
          alt:
            "Mohave County Democratic Central Committee 2026 Slate Card, English. Lists recommended candidates for federal, state and local races, and recommends NO on ballot propositions 141, 142, 144, 316, 317, 318, 319 and 320. Voter Assistance Hotline (833) VOTE-4-AZ. Early voting October 7 to 30; general election November 3. Open the PDF for a text version.",
        },
        {
          lang: "es",
          label: "Español",
          image: "/county-materials/mohave/slate-card-2026-es.webp",
          width: 2125,
          height: 2750,
          alt:
            "Tarjeta de Candidatos 2026 del Comité Central Demócrata del Condado de Mohave, en español. Lista los candidatos recomendados para contiendas federales, estatales y locales, y recomienda NO en las proposiciones 141, 142, 144, 316, 317, 318, 319 y 320. Línea de Ayuda al Votante (833) VOTE-4-AZ. Votación anticipada del 7 al 30 de octubre; elección general el 3 de noviembre. Abra el PDF para una versión de texto.",
        },
      ],
    },
  },
};

// Counties whose committee publishes its own online voter / candidate guide.
// No images are hosted here: the County Pages card just links out (new tab).
// Keyed by the same slug as COUNTY_MATERIALS / CountyPagesPage.jsx.
export const COUNTY_GUIDE_LINKS = {
  maricopa:    { label: "Voter Guide",          url: "https://www.maricopadems.org/voter-guide" },
  pima:        { label: "Voter Guide",          url: "https://www.pimadems.org/voter-guide" },
  pinal:       { label: "2026 General Candidates", url: "https://www.pinaldemocrats.org/voter-hub/2026-general-candidates" },
  "santa-cruz": { label: "2026 Candidates",     url: "https://www.azsantacruzdems.org/2026-primary-elections/candidates" },
};
