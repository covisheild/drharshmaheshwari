# New look: Beam (decided 3 Oct 2026; roll-out started 4 Oct 2026)

Harsh chose direction **Beam** from three prototypes (`design/prototypes/`). Inspiration he supplied: the DeepSeek Harness page
(near-black, a soft light beam, floating glass nav pill, big rounded cards holding live mock-ups, mono tags, white pill buttons,
drifting dust). We borrow the language, not the branding, fonts or any AI-chat imagery. What he wants: amazing, beautiful,
sci-fi/tech, professional; fast; animated at the level of the prototype.

## Settled
- **Fonts change** (Fraunces/Inter go): Outfit (headings, regular weight), DM Sans (body), DM Mono (tags, numbers).
  Self-host them (subset, woff2, `font-display: swap`) instead of Google Fonts, for speed.
- **The round photo stays exactly as it is.** The "For Doctors" label stays in the header. 4.5:1 text contrast in every
  combination stays (checked by `npm run test:e2e`); respect `prefers-reduced-motion`; pages stay static.
- **Layout**: floating glass nav pill (name + photo, links, For Everyone / For Doctors switch, theme button); centred hero with a
  mono tag line, large light-weight heading, white pill primary button; big rounded cards (28px) with a cursor-following glow;
  items rise in on scroll; closing section with dust. Both light and dark.
- **Theme colour is a single hue number per palette** (`--h`); every accent, beam, glow and dust colour is derived from it.
  Six palettes so far: Ion 228, Violet 262, Cyan 192, Orchid 322, Jade 158, Ember 24. The BMI zone colours (mint, amber, coral)
  are fixed and never change with the palette.
  - **Different for For Everyone and For Doctors.** Defaults: Everyone = Cyan, Doctors = Violet.
  - **Changeable weekly or monthly, or by hand.** Planned as `src/data/theme.json`:
    `schedule` (`fixed` | `weekly` | `monthly`), `fixed` (one palette per audience) and `rotation` (an ordered list per audience;
    the lists are offset so the two audiences never share a colour on the same week or month). A few lines in `<head>` set `--h`
    before first paint (weeks start on Monday; months on the 1st). To change colours, Harsh just asks Claude, who edits that file.
  - The prototype has a round colour button (bottom right) to preview all of this; the real site has no visitor-facing picker.
- **Dust** (hero and closing section): tiny drifting squares on a slow swirling flow. The cursor pushes them away, curls them
  (each grain has its own spin direction, so it scatters like turbulence), drags them along when it moves, and a click sends a
  shockwave. They brighten when disturbed. Off for reduced motion; no pointer, no effect. Canvas is paused when off screen.
- **The calculator picture on the home page is visual only**: it cycles through example people. Its fields link into the real
  calculator, which opens with that box selected and ready to type:
  `/tools/bmi-calculator/#height`, `#weight`, `#waist`, `#sex`. The receiving side is **already built and tested** in
  `src/pages/tools/bmi-calculator.astro` (e2e check in `tests/e2e.mjs`). The hero button uses `#height`.
- Other pages already changed this session and kept: reader account menu and `/account/`, series-page Subject dropdown, serial
  subject numbers, `/disclaimer/` ("Disclaimer and credits"), short trainer footer.

## Roll-out status
Done (branch `claude/vibrant-hypatia-fqdjed`, Cloudflare preview):
1. Tokens and fonts: `tokens.css` (hue-driven, dark and light), self-hosted Outfit / DM Sans / DM Mono, `theme.json` and `palettes.json`
   (36 colours, admin only, fixed / weekly / monthly), `src/lib/theme.ts`, `tests/theme.test.mjs`.
2. Shell: floating glass header with the audience switch inside it (short labels on phones), pill buttons, rounded cards, footer.
3. Home pages for both audiences; dust that reacts to the cursor or a finger (`fx.ts`); the other pages take the new look through the tokens.
Still to do:
- Review each inner page (Tools, Books, Videos, Learn, About, Support, Account, articles) at 390 px and 1280 px, in all palettes.
- Trainers and the book reader keep their own frames; they already use the new tokens and fonts. Polish with Harsh's review.
- Lighthouse check on the preview; decide whether to subset DM Sans further (63 KB for Latin).
- Merge: `main` is merged into the branch regularly; open the PR when Harsh approves the preview.

## Open
- Final colours: Harsh chooses on the admin colour wheel (36 colours). Today: fixed, For Everyone = Cyan, For Doctors = Violet.
- Whether Signal's ruler panel or the waveform should also appear on the real home page (currently the waveform is in the For
  Doctors window and the For Doctors card).
