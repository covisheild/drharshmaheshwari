// Site-wide facts. Mirrors the "Site settings" page in the Notion Website Desk.
export const SITE = {
  url: 'https://drharshmaheshwari.com',
  name: 'Dr. Harsh Maheshwari',
  tagline: 'Physician & public health researcher working to reverse obesity in India',
  description:
    'Evidence-based guides, tools and free books on obesity and its downstream diseases — for the public and for doctors — by Dr. Harsh Maheshwari.',
  email: 'contact@drharshmaheshwari.com',
  locale: 'en_IN',
  // Profiles listed here become schema.org sameAs links. Fill from Notion "Site settings".
  sameAs: [] as string[],
};

// Large files (books, trainer audio) live on Cloudflare R2, not in git. See CLAUDE.md.
export const FILES_URL = 'https://files.drharshmaheshwari.com';

// Navigation per audience lives in src/lib/modes.ts.

export const PERSON_JSONLD = {
  '@type': 'Person',
  '@id': `${SITE.url}/#person`,
  name: SITE.name,
  honorificPrefix: 'Dr.',
  url: `${SITE.url}/about/`,
  jobTitle: 'Physician and public health researcher (obesity)',
  description: SITE.tagline,
  alumniOf: { '@type': 'CollegeOrUniversity', name: "King George's Medical University, Lucknow" },
  affiliation: { '@type': 'CollegeOrUniversity', name: 'All India Institute of Medical Sciences, Raipur' },
  knowsAbout: ['Obesity', 'Public health', 'Epidemiology', 'Type 2 diabetes', 'Community medicine'],
  sameAs: SITE.sameAs,
};

// Drafts are visible on local dev and Cloudflare preview deployments, never on production.
// __PREVIEW_BUILD__ is set in astro.config.mjs from the branch being built.
declare const __PREVIEW_BUILD__: boolean;
export const SHOW_DRAFTS = import.meta.env.DEV || __PREVIEW_BUILD__;
