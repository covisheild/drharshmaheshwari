"""Write src/data/indian-waist-children.json: waist circumference cut-offs for Indian children aged 2 to 17 years.

Source: Khadilkar A, Ekbote V, Chiplonkar S, et al. Waist circumference percentiles in 2-18 year old Indian children.
J Pediatr 2014;164:1358-62 (PMID 24655536), copied below as printed:
  Table II  (smoothed percentiles; age = completed years "2+" to "17+"): 5th 10th 15th 25th 50th 75th 85th 90th 95th
  Table V   (the 70th percentile, the paper's cut-off for metabolic syndrome risk): boys, girls
The 70th percentile predicted two or more metabolic syndrome risk factors (sensitivity 0.84 boys / 0.82 girls, specificity 0.85).
Table III's LMS values are printed rounded (S = 0.1), too coarse for z-scores, so the calculator uses these tables.
Usage: python3 scripts/tools/indian-waist-children.py
"""
import json
from pathlib import Path

BOYS = """
2 41.9 42.9 43.5 44.6 46.8 49.3 50.8 51.9 53.7
3 43.3 44.4 45.1 46.3 48.7 51.5 53.1 54.3 56.3
4 45.1 46.2 47.1 48.4 51.1 54.2 56.0 57.4 59.6
5 46.9 48.2 49.1 50.5 53.5 57.0 59.1 60.6 63.1
6 48.8 50.2 51.2 52.8 56.1 59.9 62.2 64.0 66.7
7 50.7 52.2 53.3 55.1 58.7 62.9 65.5 67.4 70.5
8 52.6 54.3 55.5 57.4 61.3 66.0 68.8 70.9 74.3
9 54.7 56.5 57.8 59.9 64.2 69.2 72.3 74.6 78.2
10 57.0 59.0 60.4 62.6 67.3 72.7 76.0 78.4 82.3
11 59.3 61.5 63.0 65.4 70.4 76.2 79.7 82.3 86.4
12 61.5 63.8 65.4 68.0 73.3 79.4 83.1 85.8 90.1
13 63.4 65.8 67.6 70.3 75.8 82.2 86.0 88.8 93.2
14 64.9 67.5 69.3 72.2 78.0 84.5 88.4 91.2 95.6
15 66.2 68.9 70.8 73.8 79.8 86.5 90.4 93.2 97.6
16 67.4 70.2 72.1 75.2 81.3 88.1 92.1 94.9 99.2
17 68.4 71.3 73.3 76.5 82.7 89.6 93.5 96.3 100.6
"""
GIRLS = """
2 41.6 42.6 43.3 44.5 46.9 49.9 51.8 53.2 55.7
3 42.5 43.5 44.3 45.5 48.0 51.1 53.1 54.6 57.2
4 44.7 45.8 46.6 48.0 50.8 54.2 56.4 58.1 60.9
5 46.8 48.1 49.0 50.4 53.5 57.3 59.8 61.6 64.7
6 48.8 50.1 51.1 52.7 56.1 60.3 62.9 64.9 68.3
7 50.6 52.1 53.2 55.0 58.7 63.2 66.0 68.1 71.7
8 52.4 54.1 55.3 57.2 61.2 66.0 69.0 71.3 74.9
9 54.5 56.3 57.6 59.7 64.0 69.1 72.3 74.6 78.4
10 56.8 58.8 60.3 62.5 67.2 72.6 75.9 78.3 82.2
11 59.3 61.5 63.1 65.5 70.5 76.2 79.6 82.1 86.0
12 61.7 64.0 65.7 68.3 73.5 79.5 83.0 85.5 89.5
13 63.6 66.1 67.9 70.6 76.1 82.2 85.7 88.3 92.2
14 65.0 67.6 69.5 72.3 78.0 84.2 87.8 90.3 94.2
15 66.0 68.7 70.6 73.5 79.3 85.6 89.1 91.6 95.4
16 66.6 69.5 71.4 74.4 80.3 86.5 90.1 92.5 96.3
17 67.1 70.1 72.1 75.2 81.1 87.4 90.9 93.3 96.9
"""
P70 = """
2 48.8 49.1
3 50.8 50.4
4 53.4 53.4
5 56.1 56.4
6 59.0 59.3
7 61.9 62.1
8 64.9 64.9
9 68.0 67.9
10 71.4 71.3
11 74.9 74.8
12 78.0 78.1
13 80.7 80.8
14 83.0 82.7
15 84.9 84.1
16 86.5 85.1
17 87.9 85.9
"""

def rows(text, n):
    out = [[float(x) for x in line.split()] for line in text.strip().splitlines()]
    assert len(out) == 16 and all(len(r) == n for r in out) and [r[0] for r in out] == list(range(2, 18))
    return out

p70 = rows(P70, 3)
out = {'source': 'Khadilkar 2014 (J Pediatr 2014;164:1358-62), Tables II and V. Columns: age in completed years, waist (cm) at '
                 'P50, P70 (cut-off), P75, P90. Written by scripts/tools/indian-waist-children.py.'}
for i, (name, text) in enumerate((('boys', BOYS), ('girls', GIRLS))):
    t = rows(text, 10)
    out[name] = [[r[0], r[5], p70[k][1 + i], r[6], r[8]] for k, r in enumerate(t)]
    assert all(r[1] < r[2] < r[3] < r[4] for r in out[name]), name
Path(__file__).resolve().parents[2].joinpath('src/data/indian-waist-children.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
