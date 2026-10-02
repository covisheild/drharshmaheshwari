// Every calculator and tool, tagged with its audience. /tools/ and /doctors/tools/ list their own.
import type { Mode } from '../lib/modes';

export interface Tool { mode: Mode; title: string; text: string; href?: string } // no href = coming soon

export const TOOLS: Tool[] = [
  { mode: 'everyone', href: '/tools/bmi-calculator/', title: 'BMI & waist calculator', text: 'BMI, waist-to-height ratio and abdominal obesity, using Indian cut-offs.' },
  { mode: 'everyone', title: 'Indian Diabetes Risk Score (IDRS)', text: 'Four questions that estimate your risk of type 2 diabetes.' },
  { mode: 'everyone', title: 'STOP-BANG', text: 'Screen for obstructive sleep apnoea.' },
  { mode: 'doctors', title: 'FIB-4 for fatty liver', text: 'Estimate liver fibrosis risk from routine blood tests.' },
];
