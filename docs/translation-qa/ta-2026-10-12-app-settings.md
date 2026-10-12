# Tamil (ta) meaning comparison QA
Date: 2026-10-12. Scope: 53 app-settings/install strings (tr2/ta.json vs blind back-translation).

Counts: CRITICAL 0, MODERATE 1, MINOR 9 (3 fixed, rest accepted).

## MODERATE
- Index 12, "Nothing to download or approve. Whenever the app opens..." Problem: "எதையும் டவுன்லோட் செய்யவோ அனுமதிக்கவோ வேண்டாம்" read as an instruction ("do not download or allow anything"). Fix: "...தேவையில்லை" (you need not).

## MINOR
- 5 (Firefox): awkward colon and redundant "அப்படியும் இது அதேபோல்"; also "திறங்கள்" misspelt. Fixed: full stop, "திறவுங்கள்", "அதுவும் இதே போல் வேலை செய்யும்".
- 1 (Apple): back-translator misread subject; added comma after Apple to make it clear. Fixed.
- 7, 23: "and" before "trackers" lost; list form, no meaning change. Accepted.
- 8, 25, 26: "posts" dropped / "older ones"; no change in meaning. Accepted.
- 21, 44: "What works" / "Updated" for "Works without internet" / "Up to date"; wording only. Accepted.
- 34 Storage: தரவுச் சேமிப்பு is mandated by the glossary (back-translated "Data saving"). Kept.
- 35, 46: நீக்கு back-translated as "Delete" for "Remove"; same action. Accepted.
