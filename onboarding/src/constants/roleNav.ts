import type { Href } from 'expo-router';

import type { Tone } from '@/theme';

import type { CommunityIconName } from './icons';
import type { RoleId } from './roles';

// What each role sees: its tab bar and its Home shortcuts. One place, so a role's app reads as one tool.

export const TAB_ROUTES = ['home', 'log', 'farm', 'report', 'places', 'map', 'catches', 'patrols', 'guide', 'more'] as const;
export type TabRoute = (typeof TAB_ROUTES)[number];

export const TAB_LOOK: Record<TabRoute, { title: string; titleFil: string; icon: CommunityIconName }> = {
  home: { title: 'Home', titleFil: 'Home', icon: 'home-variant-outline' },
  log: { title: 'Log', titleFil: 'Itala', icon: 'notebook-edit-outline' },
  farm: { title: 'Farm', titleFil: 'Taniman', icon: 'sprout-outline' },
  report: { title: 'Report', titleFil: 'Ulat', icon: 'bullhorn-outline' },
  places: { title: 'Gallery', titleFil: 'Larawan', icon: 'image-multiple-outline' },
  map: { title: 'Map', titleFil: 'Mapa', icon: 'map-outline' },
  catches: { title: 'Catches', titleFil: 'Huli', icon: 'basket-outline' },
  patrols: { title: 'Patrols', titleFil: 'Bantay', icon: 'shield-search' },
  guide: { title: 'Guide', titleFil: 'Gabay', icon: 'book-open-variant' },
  more: { title: 'More', titleFil: 'Iba pa', icon: 'dots-horizontal' },
};

// Five tabs at most, Home first and More last. Before setup is done, the fisher layout is shown.
export const ROLE_TABS: Record<RoleId, TabRoute[]> = {
  fisherfolk: ['home', 'log', 'map', 'catches', 'more'],
  aquaculture: ['home', 'farm', 'map', 'report', 'more'],
  'bantay-dagat': ['home', 'report', 'map', 'patrols', 'more'],
  tourist: ['home', 'places', 'map', 'guide', 'more'],
  community: ['home', 'report', 'map', 'guide', 'more'],
};

export const tabsFor = (role: RoleId | null) => ROLE_TABS[role ?? 'fisherfolk'];

export interface HomeAction {
  key: string;
  href: Href;
  icon: CommunityIconName;
  tone: Tone;
  label: string;
  hint: string;
}

const A = {
  log: { key: 'log', href: '/log', icon: 'fish', tone: 'reef', label: 'Log catch', hint: 'Works without signal' },
  catches: { key: 'catches', href: '/catches', icon: 'basket-outline', tone: 'mangrove', label: 'My catches', hint: 'Records and review status' },
  farm: { key: 'farm', href: '/farm', icon: 'sprout-outline', tone: 'mangrove', label: 'My farm', hint: 'Lines, cages, and days since planting' },
  harvest: { key: 'harvest', href: '/farm', icon: 'scale', tone: 'reef', label: 'Record harvest', hint: 'Wet weight per line or cage' },
  report: { key: 'report', href: '/report', icon: 'bullhorn-outline', tone: 'coral', label: 'Report', hint: 'Tell Bantay Dagat' },
  patrol: { key: 'patrol', href: '/patrols', icon: 'shield-search', tone: 'sea', label: 'Start patrol', hint: 'Log where you went and what you saw' },
  map: { key: 'map', href: '/map', icon: 'map-outline', tone: 'sea', label: 'Map', hint: 'Zones and sanctuaries' },
  places: { key: 'places', href: '/places', icon: 'image-multiple-outline', tone: 'reef', label: 'Gallery', hint: 'Photos of beaches and islands' },
  guide: { key: 'guide', href: '/guide', icon: 'book-open-variant', tone: 'mangrove', label: 'Visit responsibly', hint: 'Reefs, turtles, and trash' },
} satisfies Record<string, HomeAction>;

export const HOME_ACTIONS: Record<RoleId, HomeAction[]> = {
  fisherfolk: [A.log, A.report, A.map, A.catches],
  aquaculture: [A.farm, A.harvest, A.report, A.map],
  'bantay-dagat': [A.report, A.patrol, A.map, A.guide],
  // Visitors have no Huli Ko account, so a report could never leave the phone; the Guide says who to tell instead.
  tourist: [A.places, A.map, A.guide],
  community: [A.report, A.map, A.guide, A.places],
};

export const actionsFor = (role: RoleId | null) => HOME_ACTIONS[role ?? 'fisherfolk'];
