# Activity check: plan and settled decisions

One calculator, `/tools/activity-check/` (For Everyone), that says whether a person reaches the physical
activity targets for their age and, from 15 years, also scores the IPAQ short form (IPAQ-SF). Runs on the device;
nothing is sent or stored. Engine: `src/lib/activity.ts`; page: `src/pages/tools/activity-check.astro`;
tests: `tests/activity.test.mjs`.

Agreed with Harsh on 11 Oct 2026 ("go with your recommendations"). Same day, after the "India first" rule: targets
switched to ICMR-NIN 2024 wherever it gives numbers (from 5 years); WHO stays for under-5s and pregnancy (see below).

## Sources (each opened and checked)

- ICMR-National Institute of Nutrition. Dietary Guidelines for Indians, 2024. Guideline 10 "Be physically active and exercise
  regularly to maintain good health", pp. 69-72. Numbers for children and adolescents (>5-19 years), adults (>19-60) and elderly
  (>60). No numbers for under-5s; for pregnancy only "enough physical exercise with adequate day time rest of 2-3 hrs" (Guideline 2).

- WHO 2020 guidelines on physical activity and sedentary behaviour. Bull FC et al. Br J Sports Med 2020;54:1451-62.
  doi:10.1136/bjsports-2020-102955 (PMID 33239350). Recommendation wording from the WHO Europe fact sheet.
- WHO guidelines on physical activity, sedentary behaviour and sleep for children under 5 years of age. WHO 2019
  (ISBN 978-92-4-155053-6; PMID 31091057).
- IPAQ Research Committee. Guidelines for data processing and analysis of the IPAQ, short and long forms. Nov 2005.
- Craig CL et al. IPAQ: 12-country reliability and validity. Med Sci Sports Exerc 2003;35:1381-95. doi:10.1249/01.MSS.0000078924.61453.FB
- Lee PH et al. Validity of the IPAQ-SF: a systematic review. Int J Behav Nutr Phys Act 2011;8:115.
  doi:10.1186/1479-5868-8-115 (IPAQ-SF overestimated activity by 84% on average versus objective measures).

## Age groups and what each is checked against

| Group | Target checked | Source | Questions |
|---|---|---|---|
| Under 1 | Not yet mobile: at least 30 min tummy time a day. Mobile: active several times a day (floor play). Not restrained more than 1 h at a time. No screen time. Sleep 14-17 h (0-3 months) or 12-16 h (4-11 months), naps included | WHO 2019 | Parent checklist |
| 1-2 years | At least 180 min/day of activity at any intensity. Not restrained more than 1 h. Screens: none at age 1, at most 1 h at age 2. Sleep 11-14 h | WHO 2019 | Parent checklist |
| 3-4 years | At least 180 min/day, of which at least 60 min moderate-to-vigorous. Not restrained more than 1 h. Screens at most 1 h. Sleep 10-13 h | WHO 2019 | Parent checklist |
| 5-14 years | At least 60 min moderate-to-vigorous **every day** (checked as 7 of the last 7 days with 60+ min). Vigorous on 3+ days. Strength training on 3+ days | ICMR-NIN 2024 | Days with 60+ min (the single-item screener), vigorous days, strength days, screen time |
| 15-19 years | Same as 5-14 | ICMR-NIN 2024 | IPAQ-SF + days with 60+ min + strength days (vigorous days from IPAQ) |
| 20-60 years | 30-60 min moderate on at least 5 days, or 15 min vigorous on at least 5 days, or a mix: checked as moderate-equivalent (moderate + walking + 2 x vigorous) at least 150 min a week **on 5 or more days** (days of the three kinds added, capped at 7, as IPAQ does). Upper: 300. Strength (all muscle groups) on 2+ days | ICMR-NIN 2024 | IPAQ-SF + strength days |
| 20-60, pregnant or within a year after birth | At least 150 min moderate a week. Include muscle strengthening (no number of days: checked as at least 1). Vigorous only if done before pregnancy | WHO 2020 | IPAQ-SF + strength days |
| Over 60 | As for adults, plus strength and functional balance on 3+ days | ICMR-NIN 2024 | IPAQ-SF + strength + balance days |

Long-term conditions: same targets; the page carries ICMR-NIN's advice to see a doctor before starting an exercise programme with heart disease,
high blood pressure, diabetes, asthma, osteoporosis or obesity, after being inactive, or over 40 before vigorous exercise.

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
2. **Walking counts towards the target minutes** (IPAQ's walking is 3.3 MET, moderate intensity). The page notes that slow strolling does not count, so mostly slow walkers should read the target minutes as generous.
3. **10-minute rule only in the IPAQ score.** WHO 2020 counts activity of any length; ICMR-NIN suggests short walks every few hours. So the
   questions ask for *all* the time on a day, not only bouts of 10 minutes, and say so; the target check counts every
   minute, and the IPAQ score drops days under 10 minutes as its protocol says. (The original IPAQ asks only about
   bouts of at least 10 minutes; the IPAQ panel discloses this difference.)
4. **Screen time and sleep are checked for under-5s only**, where WHO gives numbers. From 5 years, screen time and sitting
   are shown with the advice to limit them, without a pass mark.
5. **Words**: "Reached" / "Not yet", never "inactive" or "unhealthy"; no score out of 100. Results say what would close
   the gap (for example, "40 more minutes a week, about 6 a day").
6. **ICMR-NIN age bands** ">5–19", ">19–60", ">60" are read as 5–19, 20–60 and over 60 (Harsh, 11 Oct 2026).
7. **Children: 60 minutes every day, read literally** (ICMR-NIN "a minimum of 60 minutes per day"): the target is 7 of the
   last 7 days with 60 minutes or more, not a weekly average as in WHO (Harsh, 11 Oct 2026).

## Also noted

- IPAQ-SF overestimates (Lee 2011): the page says self-report tends to run high.
- GPAQ (WHO's own instrument, used in WHO STEPS and Indian NCD surveys; separates work, travel and leisure) could
  be added later as a second questionnaire on the same engine. Not built now.
- Publishing: built on a branch, so it is visible on the Cloudflare preview only. Harsh reviews the clinical wording
  there; merging to `main` publishes it.
