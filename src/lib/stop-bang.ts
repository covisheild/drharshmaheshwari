// STOP-Bang (Chung 2008, Anesthesiology; risk bands and stepwise rule: Chung 2012, BJA; Chung 2016, Chest).
// Eight yes/no items, 1 point each. 0-2 low, 3-4 intermediate, 5-8 high risk of moderate to severe OSA.
// A score of 3-4 is high risk if 2 or more STOP items are yes plus male sex, BMI over 35 or a large neck.

export type Answers = Partial<Record<'s' | 't' | 'o' | 'p' | 'b' | 'a' | 'n' | 'g', boolean | null>>;
export interface StopBang { score: number; stop: number; risk: 'low' | 'intermediate' | 'high'; byRule: string }

export function stopBang(a: Answers): StopBang {
  const yes = (k: keyof Answers) => (a[k] ? 1 : 0);
  const stop = yes('s') + yes('t') + yes('o') + yes('p');
  const score = stop + yes('b') + yes('a') + yes('n') + yes('g');
  if (score <= 2) return { score, stop, risk: 'low', byRule: '' };
  if (score >= 5) return { score, stop, risk: 'high', byRule: '' };
  const extra = [a.g && 'you are a man', a.b && 'your BMI is over 35', a.n && 'your neck is large'].filter(Boolean) as string[];
  if (stop >= 2 && extra.length) return { score, stop, risk: 'high', byRule: `${stop} of the first four answers are yes and ${extra.join(' and ')}` };
  return { score, stop, risk: 'intermediate', byRule: '' };
}
