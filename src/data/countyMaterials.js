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
