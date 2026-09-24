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

export const NAV = [
  { href: '/learn/', label: 'Learn' },
  { href: '/clinicians/', label: 'For Clinicians' },
  { href: '/tools/', label: 'Tools' },
  { href: '/books/', label: 'Books' },
  { href: '/videos/', label: 'Videos' },
  { href: '/blog/', label: 'Blog' },
  { href: '/about/', label: 'About' },
];

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
export const SHOW_DRAFTS =
  import.meta.env.DEV || (process.env.CF_PAGES_BRANCH ?? 'main') !== 'main';
