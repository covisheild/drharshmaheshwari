// Progress lives only in this browser (localStorage). Nothing is sent anywhere.
// Storage can be blocked (private mode, site data cleared); the trainer then still works, it just forgets.

export interface Answer {
  level: string;
  item: string;
  parts: { answer: string; chosen: string }[];
  t: number;
}

export interface Progress {
  v: 1;
  answers: Answer[];
  unlockAll?: boolean;
}

const KEEP = 2000; // most recent answers kept

export function store(trainer: string) {
  const key = `trainer:${trainer}:v1`;
  const empty = (): Progress => ({ v: 1, answers: [] });
  return {
    load(): Progress {
      try {
        const p = JSON.parse(localStorage.getItem(key) ?? 'null');
        return p?.v === 1 && Array.isArray(p.answers) ? p : empty();
      } catch { return empty(); }
    },
    save(p: Progress) {
      p.answers = p.answers.slice(-KEEP);
      try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* storage unavailable */ }
    },
    reset(): Progress {
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
      return empty();
    },
  };
}
