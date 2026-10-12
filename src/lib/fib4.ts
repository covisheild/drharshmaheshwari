// FIB-4 index (Sterling 2006, Hepatology; PMID 16729309): age [years] x AST [U/L] / (platelets [10^9/L] x sqrt(ALT [U/L])).
// Fatty liver (MASLD/NAFLD) cut-offs for advanced fibrosis (F3-F4): below 1.30 rules out, above 2.67 rules in (INASL 2023 Table 5,
// PMID 36950481; Shah 2009, PMID 19523535; EASL-EASD-EASO 2024). INASL gives no age-specific cut-off; from 65 years the lower cut-off is 2.0 (McPherson 2017, PMID 27725647).
// Under 35 the index is unreliable (McPherson 2017: AUROC 0.60). Used by /doctors/tools/fib-4/ and tests/fib4.test.mjs.

export interface Fib4Input { age: number; ast: number; alt: number; platelets: number } // platelets in 10^9/L (= 10^3/µL)

export const fib4 = ({ age, ast, alt, platelets }: Fib4Input) => (age * ast) / (platelets * Math.sqrt(alt));

/** Indian labs often report platelets in lakh/mm³: 1 lakh/mm³ = 100 x 10^9/L. */
export const lakhToSI = (lakh: number) => lakh * 100;

export type Fib4Band = 'low' | 'indeterminate' | 'high';

/** Lower cut-off: 1.30, or 2.0 from 65 years. Above 2.67 is high (INASL). Classified on the value rounded to 2 decimals, as shown. */
export function fib4Band(value: number, age: number): { band: Fib4Band; lower: number; upper: number } {
  const lower = age >= 65 ? 2.0 : 1.3, upper = 2.67;
  const v = Math.round(value * 100) / 100;
  return { band: v < lower ? 'low' : v <= upper ? 'indeterminate' : 'high', lower, upper };
}
