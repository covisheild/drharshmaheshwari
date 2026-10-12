# Malayalam (ml) QA record
Date: 2026-10-12. Scope: 53 app-settings/install strings (tr2/ml.json), blind back-translation compared by index.

Counts: CRITICAL 0, MODERATE 1, MINOR 6.

## MODERATE
1. EN: "Firefox on a computer cannot install apps. Open this site in Chrome or Edge to install it, or bookmark it: it works the same."
   Problem: "അത് ഇതുപോലെ തന്നെ പ്രവർത്തിക്കും" was ambiguous (what works like what).
   Fix: "...അല്ലെങ്കിൽ ബുക്ക്മാർക്ക് ചെയ്യുക: ബുക്ക്മാർക്ക് ചെയ്താലും ഇത് അതേപോലെ പ്രവർത്തിക്കും."

## MINOR (left as is, wording only)
- #1 stiff phrasing of Apple sentence; #3 "File" English next to translated "Add to Dock" (matches how Safari on a Mac shows menus);
  #9 button label matches elsewhere; #22 "കൂടാതെ Safari" copies existing repo wording (src/i18n/ml.json); #34 "സ്ഥലം" for Storage;
  #46 phrasing of "places where you stopped reading". All meaning-preserving; placeholders, tags, svg and link unchanged.
