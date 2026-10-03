// The two audiences of the site. The URL decides the mode: everything under /doctors/ is For Doctors,
// everything else is For Everyone. Nothing about the mode is stored in the browser, so a shared link
// always opens in the right mode.

export type Mode = 'everyone' | 'doctors';

interface Link { href: string; label: string }

export interface ModeInfo {
  id: Mode;
  label: string;         // shown in the mode switch and as the page badge
  home: string;
  tagline: string;       // under the name in the header
  nav: Link[];
  footer: { title: string; links: Link[] }[];
}

export const MODES: Record<Mode, ModeInfo> = {
  everyone: {
    id: 'everyone',
    label: 'For Everyone',
    home: '/',
    tagline: 'Obesity · Public health · Evidence',
    nav: [
      { href: '/learn/', label: 'Learn' },
      { href: '/tools/', label: 'Tools' },
      { href: '/books/', label: 'Books' },
      { href: '/videos/', label: 'Videos' },
      { href: '/blog/', label: 'Blog' },
      { href: '/about/', label: 'About' },
    ],
    footer: [
      { title: 'Learn', links: [{ href: '/learn/', label: 'Guides' }, { href: '/blog/', label: 'Blog' }] },
      { title: 'Use', links: [{ href: '/tools/', label: 'Tools' }, { href: '/books/', label: 'Free books' }, { href: '/videos/', label: 'Videos' }] },
    ],
  },
  doctors: {
    id: 'doctors',
    label: 'For Doctors',
    home: '/doctors/',
    tagline: 'For Doctors · Evidence · Trainers',
    nav: [
      { href: '/doctors/evidence/', label: 'Evidence' },
      { href: '/doctors/trainers/', label: 'Trainers' },
      { href: '/doctors/tools/', label: 'Tools' },
      { href: '/doctors/books/', label: 'Books' },
      { href: '/doctors/videos/', label: 'Videos' },
    ],
    footer: [
      { title: 'Practice', links: [{ href: '/doctors/trainers/', label: 'Clinical trainers' }, { href: '/doctors/tools/', label: 'Clinical tools' }] },
      { title: 'Read', links: [{ href: '/doctors/evidence/', label: 'Evidence syntheses' }, { href: '/doctors/books/', label: 'Books' }, { href: '/doctors/videos/', label: 'Lectures' }] },
    ],
  },
};

/** Site-wide pages that belong to neither audience in particular. They live at the root (For Everyone). */
export const SHARED_LINKS: Link[] = [
  { href: '/about/', label: 'About' },
  { href: '/account/', label: 'Your account' },
  { href: '/support/', label: 'Support this project' },
  { href: '/disclaimer/', label: 'Disclaimer and credits' },
  { href: '/privacy/', label: 'Privacy' },
  { href: '/rss.xml', label: 'RSS' },
];

export const modeOf = (path: string): Mode => (/^\/doctors(\/|$)/.test(path) ? 'doctors' : 'everyone');

/** Where a mode keeps a kind of content, e.g. section('doctors', 'books') -> '/doctors/books/'. */
export const section = (mode: Mode, name: 'books' | 'videos' | 'tools' | 'trainers') =>
  `${MODES[mode].home}${name}/`;
