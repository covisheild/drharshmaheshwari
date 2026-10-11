# Activity check: plan and settled decisions

One calculator, `/tools/activity-check/` (For Everyone), that says whether a person reaches the WHO
minimum for their age and, from 15 years, also scores the IPAQ short form (IPAQ-SF). Runs on the device;
nothing is sent or stored. Engine: `src/lib/activity.ts`; page: `src/pages/tools/activity-check.astro`;
tests: `tests/activity.test.mjs`.

Agreed with Harsh on 11 Oct 2026 ("go with your recommendations").

## Sources (each opened and checked)

- WHO 2020 guidelines on physical activity and sedentary behaviour. Bull FC et al. Br J Sports Med 2020;54:1451-62.
  doi:10.1136/bjsports-2020-102955 (PMID 33239350). Recommendation wording from the WHO Europe fact sheet.
- WHO guidelines on physical activity, sedentary behaviour and sleep for children under 5 years of age. WHO 2019
  (ISBN 978-92-4-155053-6; PMID 31091057).
- IPAQ Research Committee. Guidelines for data processing and analysis of the IPAQ, short and long forms. Nov 2005.
- Craig CL et al. IPAQ: 12-country reliability and validity. Med Sci Sports Exerc 2003;35:1381-95. doi:10.1249/01.MSS.0000078924.61453.FB
- Lee PH et al. Validity of the IPAQ-SF: a systematic review. Int J Behav Nutr Phys Act 2011;8:115.
  doi:10.1186/1479-5868-8-115 (IPAQ-SF overestimated activity by 84% on average versus objective measures).

## Age groups and what each is checked against

| Group | WHO target checked | Questions |
|---|---|---|
| Under 1 | Not yet mobile: at least 30 min tummy time a day. Mobile: active several times a day (floor play). Not restrained more than 1 h at a time. No screen time. Sleep 14-17 h (0-3 months) or 12-16 h (4-11 months), naps included | Parent checklist |
| 1-2 years | At least 180 min/day of activity at any intensity. Not restrained more than 1 h. Screens: none at age 1, at most 1 h at age 2. Sleep 11-14 h | Parent checklist |
| 3-4 years | At least 180 min/day, of which at least 60 min moderate-to-vigorous. Not restrained more than 1 h. Screens at most 1 h. Sleep 10-13 h | Parent checklist |
| 5-14 years | Average 60 min/day moderate-to-vigorous across the week (420 min/week). Vigorous on at least 3 days. Muscle and bone strengthening on at least 3 days | Days and minutes of energetic activity, vigorous days, strengthening days, screen time |
| 15-17 years | Same as 5-14 | IPAQ-SF + strengthening days |
| 18-64 years | 150-300 min moderate, or 75-150 min vigorous, or a mix (moderate-equivalent = moderate + walking + 2 x vigorous). Strengthening on at least 2 days | IPAQ-SF + strengthening days |
| 18-64, pregnant or within a year after birth | At least 150 min moderate-intensity. Include muscle strengthening (WHO sets no number of days: checked as at least 1). Vigorous only if done before pregnancy | IPAQ-SF + strengthening days |
| 65+ years | As for adults, plus varied multicomponent activity (balance and strength) on at least 3 days | IPAQ-SF + strengthening + balance days |

People with long-term conditions or disability: WHO uses the same targets, so no separate branch; one line on the page says so.

## IPAQ-SF scoring (protocol of Nov 2005, as implemented)

- MET-min/week: walking 3.3, moderate 4.0, vigorous 8.0, each x minutes/day x days.
- A day's time under 10 minutes counts as 0 (and its days as 0). Time over 180 min/day is cut to 180.
- If walking + moderate + vigorous minutes/day add to more than 960 (16 h), no IPAQ score: "please check your answers".
- **High**: vigorous on 3+ days and at least 1500 MET-min; or 7+ days (walking, moderate and vigorous days added, as the protocol says) and at least 3000.
- **Moderate**: vigorous on 3+ days for at least 20 min/day; or 5+ days of moderate and/or walking of at least 30 min/day
  (days of moderate with at least 30 min plus days of walking with at least 30 min); or 5+ days in total and at least 600 MET-min.
- **Low**: everything else. Sitting is shown separately and is not part of the score.
- Age 70+ and pregnancy: IPAQ was tested in ages 15-69 and not in pregnancy, so the category carries that note.

## Settled decisions

1. **One page, For Everyone**, at `/tools/activity-check/`. Plain results first; a collapsible "IPAQ details" panel
   (MET-min by activity, category and the criterion that set it). For Doctors > Tools lists the same page; no copy.
2. **Walking counts towards the WHO minutes** (IPAQ's walking is 3.3 MET, moderate intensity). The page notes that slow strolling does not count, so mostly slow walkers should read the WHO figure as generous.
3. **10-minute rule only in the IPAQ score.** WHO 2020 counts activity of any length ("every move counts"). So the
   questions ask for *all* the time on a day, not only bouts of 10 minutes, and say so; the WHO check counts every
   minute, and the IPAQ score drops days under 10 minutes as its protocol says. (The original IPAQ asks only about
   bouts of at least 10 minutes; the IPAQ panel discloses this difference.)
4. **Screen time and sleep are checked for under-5s only**, where WHO gives numbers. From 5 years, screen time and sitting
   are shown with WHO's advice to limit them, without a pass mark.
5. **Words**: "Reached" / "Not yet", never "inactive" or "unhealthy"; no score out of 100. Results say what would close
   the gap (for example, "40 more minutes a week, about 6 a day").

## Also noted

- IPAQ-SF overestimates (Lee 2011): the page says self-report tends to run high.
- GPAQ (WHO's own instrument, used in WHO STEPS and Indian NCD surveys; separates work, travel and leisure) could
  be added later as a second questionnaire on the same engine. Not built now.
- Publishing: built on a branch, so it is visible on the Cloudflare preview only. Harsh reviews the clinical wording
  there; merging to `main` publishes it.
