# iPhone install steps, 13 Oct 2026 (all 12 languages)

Why: a reader on iPhone + Safari could not install the app. On iOS 26 Safari the Share button is inside the ⋯ menu, and a page opened
inside another app's browser (WhatsApp, Gmail, Instagram) has no Add to Home Screen. Three new strings in `InstallApp.astro`.

- Translated natively with each glossary; Apple's on-screen labels kept in English (`<span lang="en">`), as the earlier install strings.
- `npm run i18n:check`: no errors.
- Blind back-translation (all 36 texts): meaning kept in every language, no step added, dropped or reversed; naturalness 5 except
  Odia (4.3) and Assamese (4.7). Fixed: Odia "ଏହା ବଦଳରେ" → "ଏହାର ବଦଳରେ"; Assamese "অন কৰিয়েই ৰাখক" read as "switch it on" → "অন হৈয়েই থাকিবলৈ দিয়ক" (let it stay on).
