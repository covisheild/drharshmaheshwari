# kn QA record (meaning comparison, step 4b)
Date: 2026-10-12. Scope: 53 app-settings/install strings. Found: CRITICAL 0, MODERATE 3, MINOR 4.

## MODERATE (all fixed in kn.json)
1. "Tap the Share button <svg>..." - translation added a <b> tag the English lacks. Fix: removed <b>, "Share ಬಟನ್ <svg>...".
2. "<b>Blog posts from the last 6 months.</b> Older posts are removed..." - "Older posts" became "posts older than that" (changed reference). Fix: "ಹಳೆಯ ಪೋಸ್ಟ್‌ಗಳನ್ನು".
3. "Older posts are removed from the device and open when you are online." - same fix.

## MINOR (fixed)
- "(Apple allows apps from websites only this way):" reworded more naturally.
- "<b>Add</b>" left in English next to a translated button label; now <b>ಸೇರಿಸಿ</b>.
- Firefox string: vague "works the same" clarified (ಆಗಲೂ ಇದು ಅದೇ ರೀತಿ ಕೆಲಸ ಮಾಡುತ್ತದೆ).
- Back-translator's notes on "File"/"Install" labels left in English as OS/browser menu names; no change.
