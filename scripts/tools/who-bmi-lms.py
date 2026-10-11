"""Write src/data/who-bmi-lms.json: WHO BMI-for-age LMS values, one row per month from 24 to 60 months.

Used for children aged 2 to 4 years only: IAP recommends the WHO standards under 5; from 5 years the calculator uses the
IAP 2015 Indian charts (src/data/iap-bmi-2015.json).

Sources (WHO's published tables, as distributed by WHO in its own R packages):
  WHO Child Growth Standards 2006, by day (github.com/WorldHealthOrganization/anthro, data-raw/growthstandards/bmianthro.txt);
  month m = day round(m * 30.4375) (day 731 for 24 months: standing height).
Usage: python3 scripts/tools/who-bmi-lms.py bmianthro.txt
"""
import csv, json, sys
from pathlib import Path

def rows(path):
    with open(path) as f:
        return list(csv.DictReader(f, delimiter='\t'))

std = {(int(r['sex']), int(r['age'])): r for r in rows(sys.argv[1])}
out = {'source': 'WHO Child Growth Standards 2006, BMI-for-age, 24-60 months; '
                 'columns: age in months, L, M, S. Written by scripts/tools/who-bmi-lms.py.'}
for sex, name in ((1, 'boys'), (2, 'girls')):
    table = []
    for m in range(24, 61):
        r = std[(sex, max(731, round(m * 30.4375)))]
        table.append([m, float(r['l']), float(r['m']), float(r['s'])])
    out[name] = table
Path(__file__).resolve().parents[2].joinpath('src/data/who-bmi-lms.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
