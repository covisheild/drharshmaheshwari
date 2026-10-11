"""Write src/data/iap-bmi-2015.json: IAP 2015 BMI cut-offs for Indian children aged 5 to 18 years, every half year.

Source: Indian Academy of Pediatrics Growth Charts Committee. Revised IAP growth charts for height, weight and body mass
index for 5- to 18-year-old Indian children. Indian Pediatr 2015;52:47-55 (PMID 25638185), Table VI (boys) and Table VII
(girls), copied below as printed. Columns: age (years), BMI at the 3rd, 5th, 10th, 25th, 50th percentile, the adult-equivalent
23 line (overweight; about the 71st percentile in boys, 75th in girls) and the adult-equivalent 27 line (obesity; about the
90th / 95th). The 3rd percentile defines thinness. The paper does not publish its LMS values, so the calculator uses these lines.
Usage: python3 scripts/tools/iap-bmi-2015.py
"""
import json
from pathlib import Path

BOYS = """
5.0 12.1 12.4 12.8 13.6 14.7 15.7 17.5
5.5 12.2 12.4 12.9 13.7 14.8 15.8 17.6
6.0 12.2 12.5 12.9 13.7 14.9 16.0 17.8
6.5 12.3 12.5 13.0 13.8 15.0 16.1 18.0
7.0 12.3 12.6 13.1 13.9 15.1 16.3 18.2
7.5 12.4 12.7 13.2 14.1 15.3 16.5 18.5
8.0 12.5 12.8 13.3 14.2 15.5 16.7 18.8
8.5 12.6 12.9 13.4 14.4 15.7 17.0 19.2
9.0 12.7 13.0 13.5 14.5 15.9 17.3 19.6
9.5 12.8 13.1 13.7 14.7 16.2 17.6 20.1
10.0 12.9 13.2 13.8 14.9 16.4 18.0 20.5
10.5 13.0 13.3 14.0 15.1 16.7 18.3 21.0
11.0 13.1 13.5 14.1 15.4 17.0 18.7 21.5
11.5 13.2 13.6 14.3 15.6 17.3 19.1 22.1
12.0 13.3 13.8 14.5 15.8 17.7 19.5 22.6
12.5 13.5 13.9 14.6 16.0 17.9 19.8 23.0
13.0 13.6 14.0 14.8 16.3 18.2 20.2 23.4
13.5 13.7 14.2 14.9 16.5 18.5 20.5 23.8
14.0 13.8 14.3 15.1 16.7 18.7 20.8 24.2
14.5 14.0 14.5 15.3 16.9 19.0 21.1 24.5
15.0 14.2 14.7 15.5 17.2 19.3 21.4 24.9
15.5 14.4 14.9 15.8 17.4 19.6 21.7 25.2
16.0 14.6 15.1 16.0 17.7 19.9 22.0 25.5
16.5 14.9 15.4 16.3 18.0 20.2 22.4 25.8
17.0 15.1 15.6 16.6 18.3 20.5 22.6 26.0
17.5 15.4 15.9 16.8 18.6 20.8 22.9 26.3
18.0 15.6 16.2 17.1 18.9 21.1 23.2 26.6
"""
GIRLS = """
5.0 11.9 12.1 12.5 13.3 14.3 15.5 18.0
5.5 11.9 12.2 12.6 13.4 14.4 15.7 18.3
6.0 12.0 12.2 12.7 13.5 14.5 15.9 18.6
6.5 12.1 12.3 12.8 13.6 14.7 16.1 18.9
7.0 12.1 12.4 12.8 13.7 14.9 16.4 19.3
7.5 12.2 12.5 12.9 13.9 15.1 16.6 19.7
8.0 12.3 12.6 13.1 14.0 15.3 16.9 20.1
8.5 12.3 12.7 13.2 14.2 15.6 17.2 20.5
9.0 12.4 12.8 13.3 14.4 15.8 17.6 21.0
9.5 12.5 12.9 13.5 14.6 16.1 18.0 21.4
10.0 12.7 13.1 13.7 14.9 16.5 18.4 21.9
10.5 12.8 13.2 13.9 15.2 16.8 18.8 22.5
11.0 13.0 13.4 14.1 15.5 17.2 19.3 23.0
11.5 13.2 13.7 14.4 15.8 17.6 19.8 23.6
12.0 13.4 13.9 14.7 16.1 18.0 20.2 24.1
12.5 13.7 14.2 15.0 16.5 18.4 20.7 24.7
13.0 13.9 14.4 15.2 16.8 18.8 21.1 25.2
13.5 14.1 14.6 15.5 17.1 19.1 21.5 25.6
14.0 14.3 14.9 15.7 17.3 19.4 21.8 25.9
14.5 14.5 15.1 16.0 17.6 19.7 22.0 26.2
15.0 14.7 15.2 16.1 17.8 19.9 22.3 26.3
15.5 14.9 15.4 16.3 18.0 20.1 22.4 26.4
16.0 15.0 15.6 16.5 18.2 20.3 22.6 26.5
16.5 15.2 15.8 16.7 18.4 20.4 22.8 26.6
17.0 15.4 16.0 16.9 18.6 20.6 22.9 26.7
17.5 15.5 16.1 17.1 18.7 20.8 23.1 26.7
18.0 15.7 16.3 17.3 18.9 21.0 23.2 26.8
"""

def table(text):
    rows = [[float(x) for x in line.split()] for line in text.strip().splitlines()]
    assert len(rows) == 27 and all(len(r) == 8 for r in rows)
    assert all(r[1] < r[2] <= r[3] < r[4] < r[5] < r[6] < r[7] for r in rows)
    return rows

out = {'source': 'IAP 2015 (Indian Pediatr 2015;52:47-55), Tables VI and VII. Columns: age in years, BMI at P3, P5, P10, '
                 'P25, P50, adult-equivalent 23 (overweight), adult-equivalent 27 (obesity). Written by scripts/tools/iap-bmi-2015.py.',
       'boys': table(BOYS), 'girls': table(GIRLS)}
Path(__file__).resolve().parents[2].joinpath('src/data/iap-bmi-2015.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
