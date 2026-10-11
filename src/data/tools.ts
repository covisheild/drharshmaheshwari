// Every calculator and tool, tagged with its audience. /tools/ and /doctors/tools/ list their own.
import type { Mode } from '../lib/modes';

export interface Tool { mode: Mode; title: string; text: string; href?: string } // no href = coming soon

export const TOOLS: Tool[] = [
  { mode: 'everyone', href: '/tools/bmi-calculator/', title: 'BMI & waist calculator', text: 'BMI, waist-to-height ratio and abdominal obesity, using Indian cut-offs.' },
  { mode: 'everyone', href: '/tools/activity-check/', title: 'Activity check', text: 'Does your week reach the WHO physical activity targets for your age? With the IPAQ score from 15 years.' },
  { mode: 'everyone', title: 'Indian Diabetes Risk Score (IDRS)', text: 'Four questions that estimate your risk of type 2 diabetes.' },
  { mode: 'everyone', href: '/tools/stop-bang/', title: 'STOP-Bang', text: 'Eight yes/no questions that estimate your risk of obstructive sleep apnoea.' },
  { mode: 'doctors', href: '/tools/activity-check/', title: 'Activity check: IPAQ-SF and WHO targets', text: 'IPAQ short form (MET-min/week, Low/Moderate/High by the 2005 protocol) beside the WHO 2020 targets for every age group.' },
  { mode: 'doctors', title: 'FIB-4 for fatty liver', text: 'Estimate liver fibrosis risk from routine blood tests.' },
];
