import {
  AuthError,
  RateLimitError,
  ApiGuild,
  ApiGuildMember,
  fetchGuildMember,
  fetchGuilds,
  fetchMe,
  fetchWidget,
  logout,
} from './lib/api';
import {
  clearWidgetCache,
  createDefaultUserData,
  exportUserData,
  importUserData,
  loadUserData,
  saveUserData,
  toggleFavorite,
  updateLastFetchTimestamp,
  updateNickname,
  updateNotes,
  updateWidgetCache,
  type UserDataStore,
  type WidgetCacheEntry,
} from './lib/storage';
import { createModalController } from './components/modal';
import { createServerCard, type ServerView } from './components/serverCard';
import { createToastManager, type ToastManager } from './components/toast';
import {
  createElement,
  formatCooldownRemaining,
  formatRelativeTime,
  formatSecondsRemaining,
  getCooldownRemaining,
  getIconUrl,
} from './lib/utils';

type FilterKey = 'all' | 'owned' | 'partner' | 'verified' | 'boosted' | 'discoverable';
type SectionKey = 'favorites' | 'owned' | 'public' | 'private';

const COLLAPSED_SECTIONS_KEY = 'discord_manager_collapsed_sections';

const filterTooltipCopy: Partial<Record<FilterKey, string>> = {
  owned: 'Servers you administer',
  partner: 'Discord Partner Program',
  verified: 'Officially verified server',
  boosted: 'Nitro boost enabled',
  discoverable: 'Listed in Server Discovery',
};

interface AppState {
  me: string | null;
  guilds: ApiGuild[];
  userData: UserDataStore;
  activeFilters: Set<FilterKey>;
  search: string;
}

interface SectionElements {
  section: HTMLElement;
  list: HTMLElement;
  count: HTMLElement;
  content: HTMLElement;
  header: HTMLButtonElement;
}

interface DemoGuildEntry {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  owner: boolean;
  features: string[];
}

const getElement = <T extends HTMLElement>(selector: string): T => {
  const element = selector.startsWith('[') || selector.startsWith('.')
    ? document.querySelector<T>(selector)
    : document.getElementById(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
};

const setFooterYear = (): void => {
  const footerYear = document.getElementById('footer-year');
  if (footerYear) {
    footerYear.textContent = `${new Date().getFullYear()}`;
  }
};

const setFooterBuildInfo = (): void => {
  const footerBuild = document.getElementById('footer-build');
  if (!footerBuild) {
    return;
  }
  const version = import.meta.env.VITE_APP_VERSION;
  const timestamp = import.meta.env.VITE_BUILD_TIMESTAMP;
  if (version && timestamp) {
    footerBuild.textContent = `[Build ${version}-${timestamp}]`;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasBoost = (features: string[]): boolean =>
  features.includes('ANIMATED_ICON') || features.includes('ANIMATED_BANNER');

const loadCollapsedSections = (): Set<SectionKey> => {
  try {
    const stored = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (!stored) return new Set();
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is SectionKey =>
      typeof item === 'string' && ['favorites', 'owned', 'public', 'private'].includes(item)
    ));
  } catch {
    return new Set();
  }
};

const saveCollapsedSections = (collapsed: Set<SectionKey>): void => {
  localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsed]));
};

const collapsedSections = loadCollapsedSections();

const isDemoMode = new URLSearchParams(window.location.search).get('demo') === '1';
const DEMO_GUILDS_KEY = 'discord_manager_demo_guilds';
const DEMO_STORAGE_KEY = 'discord_manager_demo_user_data';
const storageOptions = isDemoMode ? { storageKey: DEMO_STORAGE_KEY } : undefined;

const state: AppState = {
  me: null,
  guilds: [],
  userData: loadUserData(storageOptions),
  activeFilters: new Set<FilterKey>(),
  search: '',
};

const loginScreen = getElement<HTMLElement>('login-screen');
const loginActions = getElement<HTMLElement>('login-actions');
const demoLoader = getElement<HTMLElement>('demo-loader');
const demoImportButton = getElement<HTMLButtonElement>('demo-import-button');
const demoStatus = getElement<HTMLElement>('demo-status');
const appShell = getElement<HTMLElement>('app-shell');
const searchInput = getElement<HTMLInputElement>('search-input');
const searchHelper = getElement<HTMLElement>('search-helper');
const emptyState = getElement<HTMLElement>('empty-state');
const statTotal = getElement<HTMLElement>('stat-total');
const statFavorites = getElement<HTMLElement>('stat-favorites');
const statOwned = getElement<HTMLElement>('stat-owned');
const statPublic = getElement<HTMLElement>('stat-public');

const sections: Record<string, SectionElements> = {
  favorites: {
    section: getElement<HTMLElement>('favorites-section'),
    list: getElement<HTMLElement>('favorites-list'),
    count: getElement<HTMLElement>('favorites-count'),
    content: getElement<HTMLElement>('favorites-content'),
    header: getElement<HTMLButtonElement>('[data-collapse-toggle="favorites"]'),
  },
  owned: {
    section: getElement<HTMLElement>('owned-section'),
    list: getElement<HTMLElement>('owned-list'),
    count: getElement<HTMLElement>('owned-count'),
    content: getElement<HTMLElement>('owned-content'),
    header: getElement<HTMLButtonElement>('[data-collapse-toggle="owned"]'),
  },
  public: {
    section: getElement<HTMLElement>('public-section'),
    list: getElement<HTMLElement>('public-list'),
    count: getElement<HTMLElement>('public-count'),
    content: getElement<HTMLElement>('public-content'),
    header: getElement<HTMLButtonElement>('[data-collapse-toggle="public"]'),
  },
  private: {
    section: getElement<HTMLElement>('private-section'),
    list: getElement<HTMLElement>('private-list'),
    count: getElement<HTMLElement>('private-count'),
    content: getElement<HTMLElement>('private-content'),
    header: getElement<HTMLButtonElement>('[data-collapse-toggle="private"]'),
  },
};

const setSectionCollapsed = (sectionKey: SectionKey, collapsed: boolean): void => {
  const section = sections[sectionKey];
  if (!section) return;
  
  section.header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  section.content.classList.toggle('is-collapsed', collapsed);
  
  if (collapsed) {
    collapsedSections.add(sectionKey);
  } else {
    collapsedSections.delete(sectionKey);
  }
  saveCollapsedSections(collapsedSections);
};

const toggleSectionCollapse = (sectionKey: SectionKey): void => {
  const section = sections[sectionKey];
  if (!section) return;
  
  const isExpanded = section.header.getAttribute('aria-expanded') === 'true';
  setSectionCollapsed(sectionKey, isExpanded);
};

const initializeSectionStates = (): void => {
  (['favorites', 'owned', 'public', 'private'] as const).forEach((key) => {
    const section = sections[key];
    if (!section) return;
    
    const isCollapsed = collapsedSections.has(key);
    section.header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    section.content.classList.toggle('is-collapsed', isCollapsed);
  });
};

const toastRegion = getElement<HTMLElement>('toast-region');
const toast = createToastManager(toastRegion);
const importModal = createModalController(getElement('import-modal'));
const fetchModal = createModalController(getElement('fetch-modal'));
const detailsModal = createModalController(getElement('details-modal'));
const instructionsModal = createModalController(getElement('instructions-modal'));
const demoModal = createModalController(getElement('demo-modal'));
const detailsBody = getElement<HTMLElement>('details-body');

const importButton = getElement<HTMLButtonElement>('btn-import');
const importTooltip = getElement<HTMLElement>('import-tooltip');
const importCopy = getElement<HTMLElement>('import-copy');
const importGuildsCard = getElement<HTMLElement>('import-guilds-card');
const importUserCopy = getElement<HTMLElement>('import-user-copy');
const importUserMeta = getElement<HTMLElement>('import-user-meta');
const importGuildsMeta = getElement<HTMLElement>('import-guilds-meta');
const importUserInput = getElement<HTMLInputElement>('import-user-input');
const importGuildsInput = getElement<HTMLInputElement>('import-guilds-input');
const importStatus = getElement<HTMLElement>('import-status');
const importInstructionsLink = getElement<HTMLButtonElement>('import-instructions-link');
const importUserLabel = getElement<HTMLElement>('import-user-label');
const instructionsCodeCopy = getElement<HTMLButtonElement>('instructions-code-copy');
const instructionsCodeSnippet = getElement<HTMLPreElement>('instructions-code-snippet');
const demoInstructionsLink = getElement<HTMLButtonElement>('demo-instructions-link');
const demoGuildsInput = getElement<HTMLInputElement>('demo-guilds-input');
const demoModalStatus = getElement<HTMLElement>('demo-modal-status');

const fetchSkipInfo = getElement<HTMLElement>('fetch-skip-info');
const fetchForce = getElement<HTMLInputElement>('fetch-force');
const fetchStart = getElement<HTMLButtonElement>('fetch-start');
const fetchButton = getElement<HTMLButtonElement>('btn-fetch');
const fetchTooltipAnchor = getElement<HTMLElement>('fetch-tooltip-anchor');
const fetchTooltip = getElement<HTMLElement>('fetch-tooltip');
const fetchLastRun = getElement<HTMLElement>('fetch-last-run');
const fetchProgressInline = getElement<HTMLElement>('fetch-progress-inline');
const fetchInlineText = getElement<HTMLElement>('fetch-inline-text');
const fetchInlineBar = getElement<HTMLElement>('fetch-inline-bar');
const fetchInlineDetail = getElement<HTMLElement>('fetch-inline-detail');
const fetchInlineStop = getElement<HTMLButtonElement>('fetch-inline-stop');

const FETCH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

let fetchShouldStop = false;
let fetchInProgress = false;
let cooldownTimerId: number | undefined;
let rateLimitTimerId: number | undefined;
let rateLimitUntil: number | null = null;
let demoUserDataLoaded = false;

const showToast: ToastManager['show'] = (message, options) => {
  if (appShell.getAttribute('aria-hidden') === 'true') {
    return;
  }
  toast.show(message, options);
};

const closeAppOverlays = (): void => {
  fetchShouldStop = true;
  fetchInProgress = false;
  fetchProgressInline.classList.add('hidden');
  stopCooldownTimer();
  stopRateLimitTimer();
  importModal.close();
  fetchModal.close();
  detailsModal.close();
  instructionsModal.close();
  demoModal.close();
  toastRegion.replaceChildren();
};

const setScreen = (screen: 'login' | 'app'): void => {
  const isLogin = screen === 'login';
  loginScreen.setAttribute('aria-hidden', isLogin ? 'false' : 'true');
  appShell.setAttribute('aria-hidden', isLogin ? 'true' : 'false');
  loginScreen.classList.toggle('hidden', !isLogin);
  appShell.classList.toggle('hidden', isLogin);
  if (isLogin) {
    closeAppOverlays();
  }
  if (!isLogin) {
    document.querySelectorAll<HTMLElement>('[data-animate]').forEach((el) => {
      el.classList.add('fade-up');
    });
  }
};

const getWidgetView = (guildId: string): WidgetCacheEntry | null => {
  return state.userData.widgetCache[guildId] ?? null;
};

const buildServerViews = (): ServerView[] => {
  return state.guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon ?? null,
    banner: guild.banner ?? null,
    owner: guild.owner,
    features: guild.features ?? [],
    nickname: state.userData.nicknames[guild.id],
    notes: state.userData.notes[guild.id],
    isFavorite: state.userData.favorites.includes(guild.id),
    widget: getWidgetView(guild.id),
  }));
};

const matchesSingleFilter = (server: ServerView, filter: FilterKey): boolean => {
  switch (filter) {
    case 'owned':
      return server.owner;
    case 'partner':
      return server.features.includes('PARTNERED');
    case 'verified':
      return server.features.includes('VERIFIED');
    case 'boosted':
      return hasBoost(server.features);
    case 'discoverable':
      return server.features.includes('DISCOVERABLE');
    default:
      return true;
  }
};

const matchesFilter = (server: ServerView, activeFilters: Set<FilterKey>): boolean => {
  if (activeFilters.size === 0) {
    return true;
  }
  for (const filter of activeFilters) {
    if (!matchesSingleFilter(server, filter)) {
      return false;
    }
  }
  return true;
};

const matchesSearch = (server: ServerView, query: string): boolean => {
  if (!query) return true;
  const value = query.toLowerCase();
  const nickname = server.nickname?.toLowerCase() ?? '';
  return server.name.toLowerCase().includes(value) || nickname.includes(value);
};

const getDisplayName = (server: ServerView): string => server.nickname ?? server.name;

const startsWithAlphanumeric = (value: string): boolean => /^[0-9a-z]/i.test(value.trim());

const sortByName = (a: ServerView, b: ServerView): number => {
  const nameA = getDisplayName(a);
  const nameB = getDisplayName(b);
  return nameA.localeCompare(nameB);
};

const sortByBannerThenName = (a: ServerView, b: ServerView): number => {
  const hasBannerA = Boolean(a.banner);
  const hasBannerB = Boolean(b.banner);
  if (hasBannerA !== hasBannerB) {
    return hasBannerA ? -1 : 1;
  }
  const nameA = getDisplayName(a);
  const nameB = getDisplayName(b);
  const alphanumericA = startsWithAlphanumeric(nameA);
  const alphanumericB = startsWithAlphanumeric(nameB);
  if (alphanumericA !== alphanumericB) {
    return alphanumericA ? -1 : 1;
  }
  return nameA.localeCompare(nameB);
};

const renderSection = (key: string, servers: ServerView[]): void => {
  const section = sections[key];
  section.list.replaceChildren();
  section.count.textContent = `${servers.length}`;
  if (servers.length === 0) {
    section.section.classList.add('hidden');
    return;
  }
  section.section.classList.remove('hidden');
  servers.forEach((server) => {
    section.list.appendChild(
      createServerCard(server, {
        onToggleFavorite: (guildId) => {
          state.userData = toggleFavorite(state.userData, guildId, storageOptions);
          showToast(
            state.userData.favorites.includes(guildId)
              ? 'Added to favorites'
              : 'Removed from favorites',
          );
          render();
        },
        onOpenDetails: (guildId) => openDetails(guildId),
      }),
    );
  });
};

const render = (): void => {
  const allViews = buildServerViews();
  const filtered = allViews.filter((server) =>
    matchesFilter(server, state.activeFilters) && matchesSearch(server, state.search.trim()),
  );

  const favorites = filtered.filter((server) => server.isFavorite).sort(sortByName);
  const owned = filtered.filter((server) => server.owner && !server.isFavorite).sort(sortByName);
  const publicServers = filtered
    .filter((server) => !server.owner && !server.isFavorite && Boolean(server.widget?.instantInvite))
    .sort(sortByBannerThenName);
  const privateServers = filtered
    .filter((server) => !server.owner && !server.isFavorite && !server.widget?.instantInvite)
    .sort(sortByBannerThenName);

  renderSection('favorites', favorites);
  renderSection('owned', owned);
  renderSection('public', publicServers);
  renderSection('private', privateServers);

  const favoritesTotal = allViews.filter((server) => server.isFavorite).length;
  const ownedTotal = allViews.filter((server) => server.owner).length;
  const publicTotal = allViews.filter((server) => server.widget?.instantInvite).length;
  statTotal.textContent = `${allViews.length}`;
  statFavorites.textContent = `${favoritesTotal}`;
  statOwned.textContent = `${ownedTotal}`;
  statPublic.textContent = `${publicTotal}`;

  emptyState.classList.toggle('hidden', allViews.length > 0);
  searchHelper.classList.toggle('hidden', state.search.trim().length > 0);
};

const updateFilterClearVisibility = (): void => {
  const clearButton = document.getElementById('filter-clear');
  if (clearButton) {
    const hasActiveFilters = state.activeFilters.size > 0;
    clearButton.classList.toggle('hidden', !hasActiveFilters);
  }
};

const updateFilterUI = (): void => {
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    const filter = button.dataset.filter as FilterKey | undefined;
    if (!filter || filter === 'all') {
      return;
    }
    const isActive = state.activeFilters.has(filter);
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  updateFilterClearVisibility();
};

const toggleFilter = (filter: FilterKey): void => {
  if (filter === 'all') {
    state.activeFilters.clear();
  } else if (state.activeFilters.has(filter)) {
    state.activeFilters.delete(filter);
  } else {
    state.activeFilters.add(filter);
  }
  updateFilterUI();
  render();
};

const clearFilters = (): void => {
  state.activeFilters.clear();
  updateFilterUI();
  render();
};

const updateSearch = (value: string): void => {
  state.search = value;
  render();
};

const openDetails = async (guildId: string): Promise<void> => {
  const server = state.guilds.find((item) => item.id === guildId);
  if (!server) return;
  detailsBody.replaceChildren();

  const loading = createElement('p', 'muted', 'Loading server details...');
  detailsBody.appendChild(loading);
  detailsModal.open();

  let member: ApiGuildMember | null = null;
  if (!isDemoMode) {
    try {
      member = await fetchGuildMember(guildId);
    } catch (error) {
      if (error instanceof AuthError) {
        setScreen('login');
        return;
      }
      detailsBody.replaceChildren(createElement('p', 'muted', 'Unable to load server details.'));
      return;
    }
  }

  detailsBody.replaceChildren();

  const header = createElement('div', 'details-header');
  const icon = createElement('div', 'details-icon');
  const iconUrl = getIconUrl(server.id, server.icon ?? null);
  if (iconUrl) {
    const image = document.createElement('img');
    image.src = iconUrl;
    image.alt = `${server.name} icon`;
    image.onerror = () => image.remove();
    icon.appendChild(image);
  } else {
    icon.textContent = server.name.charAt(0).toUpperCase();
  }
  header.appendChild(icon);

  const headerText = createElement('div', 'details-title');
  headerText.appendChild(createElement('h4', '', server.name));
  const idRow = createElement('div', 'details-id-row');
  const idText = createElement('span', 'muted', `ID: ${server.id}`);
  const copyButton = createElement('button', 'btn btn-secondary', 'Copy ID');
  copyButton.type = 'button';
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(server.id);
      showToast('Server ID copied');
    } catch {
      showToast('Unable to copy ID', { variant: 'error' });
    }
  });
  idRow.append(idText, copyButton);
  headerText.appendChild(idRow);
  header.appendChild(headerText);
  detailsBody.appendChild(header);

  const meta = createElement('div', 'details-meta');
  const joinedAt = member?.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'Unknown';
  const rolesCount = member?.roles ? member.roles.length : 0;
  const widgetStatus = state.userData.widgetCache[guildId]?.instantInvite ? 'Widget enabled' : 'Widget off';
  meta.appendChild(createElement('div', 'detail-row', `Joined: ${joinedAt}`));
  meta.appendChild(createElement('div', 'detail-row', `Roles: ${rolesCount}`));
  meta.appendChild(createElement('div', 'detail-row', widgetStatus));
  detailsBody.appendChild(meta);

  const nicknameField = createElement('div', 'form-field');
  const nicknameLabel = createElement('label', '', 'Nickname');
  nicknameLabel.setAttribute('for', 'nickname-input');
  const nicknameInput = document.createElement('input');
  nicknameInput.id = 'nickname-input';
  nicknameInput.type = 'text';
  nicknameInput.value = state.userData.nicknames[guildId] ?? '';
  nicknameField.append(nicknameLabel, nicknameInput);
  detailsBody.appendChild(nicknameField);

  const notesField = createElement('div', 'form-field');
  const notesLabel = createElement('label', '', 'Notes');
  notesLabel.setAttribute('for', 'notes-input');
  const notesInput = document.createElement('textarea');
  notesInput.id = 'notes-input';
  notesInput.value = state.userData.notes[guildId] ?? '';
  notesField.append(notesLabel, notesInput);
  detailsBody.appendChild(notesField);

  const actions = createElement('div', 'modal-actions');
  const saveButton = createElement('button', 'btn btn-primary', 'Save');
  saveButton.type = 'button';
  saveButton.addEventListener('click', () => {
    state.userData = updateNickname(state.userData, guildId, nicknameInput.value, storageOptions);
    state.userData = updateNotes(state.userData, guildId, notesInput.value, storageOptions);
    showToast('Details saved');
    render();
    detailsModal.close();
  });
  const cancelButton = createElement('button', 'btn btn-secondary', 'Cancel');
  cancelButton.type = 'button';
  cancelButton.addEventListener('click', () => detailsModal.close());
  actions.append(saveButton, cancelButton);
  detailsBody.appendChild(actions);
};

const updateFetchButtonState = (): void => {
  if (isDemoMode) return;

  // Check rate limit first (takes priority)
  const isRateLimited = rateLimitUntil !== null && rateLimitUntil > Date.now();
  const remaining = getCooldownRemaining(state.userData.lastFetchTimestamp, FETCH_COOLDOWN_MS);
  const isOnCooldown = remaining > 0;
  const isDisabled = isRateLimited || isOnCooldown || fetchInProgress;

  fetchButton.disabled = isDisabled;
  fetchButton.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');

  if (isRateLimited) {
    const secondsRemaining = Math.ceil((rateLimitUntil! - Date.now()) / 1000);
    const formatted = formatSecondsRemaining(secondsRemaining);
    fetchTooltip.textContent = `Rate limited by Discord. Available in ${formatted}.`;
    fetchTooltip.classList.add('is-cooldown');
    fetchTooltipAnchor.classList.add('is-tooltip-active');
    fetchTooltipAnchor.setAttribute('tabindex', '0');
    fetchTooltip.setAttribute('aria-hidden', 'false');
  } else if (isOnCooldown) {
    const formatted = formatCooldownRemaining(remaining);
    fetchTooltip.textContent = `Cooldown active. Available in ${formatted}.`;
    fetchTooltip.classList.add('is-cooldown');
    fetchTooltipAnchor.classList.add('is-tooltip-active');
    fetchTooltipAnchor.setAttribute('tabindex', '0');
    fetchTooltip.setAttribute('aria-hidden', 'false');
  } else if (fetchInProgress) {
    fetchTooltip.textContent = 'Fetch in progress...';
    fetchTooltip.classList.remove('is-cooldown');
    fetchTooltipAnchor.classList.add('is-tooltip-active');
    fetchTooltipAnchor.setAttribute('tabindex', '0');
    fetchTooltip.setAttribute('aria-hidden', 'false');
  } else {
    fetchTooltip.textContent = '';
    fetchTooltip.classList.remove('is-cooldown');
    fetchTooltipAnchor.classList.remove('is-tooltip-active');
    fetchTooltipAnchor.removeAttribute('tabindex');
    fetchTooltip.setAttribute('aria-hidden', 'true');
  }
};

const updateFetchLastRunDisplay = (): void => {
  if (isDemoMode) {
    fetchLastRun.textContent = '';
    return;
  }

  const timestamp = state.userData.lastFetchTimestamp;
  if (timestamp) {
    fetchLastRun.textContent = `Last fetched ${formatRelativeTime(timestamp)}`;
  } else {
    fetchLastRun.textContent = '';
  }
};

const startCooldownTimer = (): void => {
  stopCooldownTimer();
  const tick = (): void => {
    updateFetchButtonState();
    updateFetchLastRunDisplay();
    const remaining = getCooldownRemaining(state.userData.lastFetchTimestamp, FETCH_COOLDOWN_MS);
    if (remaining <= 0) {
      stopCooldownTimer();
    }
  };
  tick();
  cooldownTimerId = window.setInterval(tick, 60000); // Update every minute
};

const stopCooldownTimer = (): void => {
  if (cooldownTimerId !== undefined) {
    window.clearInterval(cooldownTimerId);
    cooldownTimerId = undefined;
  }
};

const startRateLimitTimer = (retryAfterSeconds: number): void => {
  stopRateLimitTimer();
  rateLimitUntil = Date.now() + retryAfterSeconds * 1000;

  const tick = (): void => {
    updateFetchButtonState();
    if (rateLimitUntil === null || rateLimitUntil <= Date.now()) {
      stopRateLimitTimer();
    }
  };

  tick();
  rateLimitTimerId = window.setInterval(tick, 1000); // Update every second for rate limit
};

const stopRateLimitTimer = (): void => {
  if (rateLimitTimerId !== undefined) {
    window.clearInterval(rateLimitTimerId);
    rateLimitTimerId = undefined;
  }
  rateLimitUntil = null;
};

const updateFetchSkipInfo = (): void => {
  if (fetchForce.checked) {
    fetchSkipInfo.textContent = 'All cached results will be cleared before fetching.';
    return;
  }
  const cachedCount = Object.keys(state.userData.widgetCache).length;
  fetchSkipInfo.textContent =
    cachedCount === 0
      ? 'No cached widget data yet.'
      : `${cachedCount} servers already cached and will be skipped.`;
};

const FETCH_BATCH_SIZE = 5;
const FETCH_BATCH_DELAY_MS = 1000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const performWidgetFetch = async (): Promise<void> => {
  if (isDemoMode) {
    showToast('Demo mode uses local data only.');
    return;
  }

  // Close modal and show inline progress
  fetchModal.close();
  fetchShouldStop = false;
  fetchInProgress = true;
  updateFetchButtonState();

  // Show inline progress
  fetchProgressInline.classList.remove('hidden');
  fetchInlineBar.classList.remove('is-stopped');
  fetchInlineBar.style.width = '0%';
  fetchInlineText.textContent = 'Fetching...';
  fetchInlineDetail.textContent = '';

  const force = fetchForce.checked;
  if (force) {
    state.userData = clearWidgetCache(state.userData, storageOptions);
  }

  const serverIds = state.guilds.map((guild) => guild.id);
  const targets = force
    ? serverIds
    : serverIds.filter((id) => !state.userData.widgetCache[id]);

  const total = targets.length;
  let completed = 0;
  let widgetsEnabled = 0;
  let widgetsDisabled = 0;
  let errors = 0;
  let rateLimited = false;
  let anySuccess = false;

  if (total === 0) {
    fetchProgressInline.classList.add('hidden');
    fetchInProgress = false;
    updateFetchButtonState();
    showToast('All servers already cached', { variant: 'info' });
    return;
  }

  const processBatch = async (batch: string[]): Promise<void> => {
    const results = await Promise.allSettled(
      batch.map(async (guildId) => {
        const widget = await fetchWidget(guildId);
        return { guildId, widget };
      })
    );

    for (const result of results) {
      if (fetchShouldStop || rateLimited) break;

      if (result.status === 'fulfilled') {
        anySuccess = true;
        const { guildId, widget } = result.value;
        const hasData = widget.instant_invite != null || widget.presence_count != null;
        const entry: WidgetCacheEntry = {
          instantInvite: widget.instant_invite ?? null,
          presenceCount: widget.presence_count ?? null,
          lastCached: new Date().toISOString(),
        };
        state.userData = updateWidgetCache(state.userData, guildId, entry, storageOptions);
        if (hasData) {
          widgetsEnabled += 1;
        } else {
          widgetsDisabled += 1;
        }
      } else {
        const error = result.reason;
        if (error instanceof AuthError) {
          fetchProgressInline.classList.add('hidden');
          fetchInProgress = false;
          updateFetchButtonState();
          setScreen('login');
          return;
        }
        if (error instanceof RateLimitError) {
          rateLimited = true;
          fetchInlineBar.classList.add('is-stopped');
          // Start rate limit timer if we have a retry-after value
          if (error.retryAfter !== null && error.retryAfter > 0) {
            startRateLimitTimer(error.retryAfter);
            const formatted = formatSecondsRemaining(error.retryAfter);
            showToast(`Rate limited by Discord. Available in ${formatted}.`, { variant: 'error' });
          } else {
            showToast('Rate limited by Discord. Try again later.', { variant: 'error' });
          }
          return;
        }
        errors += 1;
      }
      completed += 1;
    }

    const progress = total === 0 ? 100 : Math.round((completed / total) * 100);
    fetchInlineBar.style.width = `${progress}%`;
    fetchInlineText.textContent = `Fetching (${completed}/${total})`;
    fetchInlineDetail.textContent = `${widgetsEnabled} with public data`;
  };

  // Process in batches with delay between each batch
  for (let i = 0; i < targets.length; i += FETCH_BATCH_SIZE) {
    if (fetchShouldStop || rateLimited) {
      fetchInlineBar.classList.add('is-stopped');
      break;
    }

    const batch = targets.slice(i, i + FETCH_BATCH_SIZE);
    await processBatch(batch);

    // Add delay between batches (but not after the last one)
    if (i + FETCH_BATCH_SIZE < targets.length && !fetchShouldStop && !rateLimited) {
      await delay(FETCH_BATCH_DELAY_MS);
    }
  }

  // Hide inline progress
  fetchProgressInline.classList.add('hidden');
  fetchInProgress = false;

  // Update timestamp if any successful responses
  if (anySuccess) {
    state.userData = updateLastFetchTimestamp(state.userData, new Date().toISOString(), storageOptions);
    startCooldownTimer();
  }

  updateFetchButtonState();
  updateFetchLastRunDisplay();

  // Show completion toast
  const parts: string[] = [];
  if (widgetsEnabled > 0) parts.push(`${widgetsEnabled} public`);
  if (widgetsDisabled > 0) parts.push(`${widgetsDisabled} disabled`);
  if (errors > 0) parts.push(`${errors} errors`);
  const summary = parts.length > 0 ? parts.join(', ') : 'No data found';

  if (rateLimited) {
    // Toast already shown above
  } else if (fetchShouldStop) {
    showToast(`Stopped. ${summary}`, { variant: 'info' });
  } else {
    showToast(`Fetch complete. ${summary}`, { variant: 'success' });
  }

  render();
};

const handleImport = async (file: File): Promise<boolean> => {
  try {
    const content = await file.text();
    const parsed: unknown = JSON.parse(content);
    state.userData = importUserData(parsed, storageOptions);
    if (isDemoMode && loginScreen.getAttribute('aria-hidden') === 'false') {
      demoUserDataLoaded = true;
      const message = 'User data loaded. Load guilds_api.json to continue.';
      setImportStatus(message, 'neutral');
      setDemoStatus(message, 'neutral');
    }
    showToast('User data imported');
    render();
    return true;
  } catch (error) {
    console.error(error);
    showToast('Import failed', { variant: 'error' });
    setImportStatus('Import failed. Expect user_data.json.', 'error');
    return false;
  }
};

const handleExport = (): void => {
  const blob = new Blob([exportUserData(state.userData)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'user_data.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('User data exported');
};

const parseDemoGuilds = (value: unknown): DemoGuildEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): DemoGuildEntry | null => {
      if (!isRecord(entry)) return null;
      const id = typeof entry.id === 'string' ? entry.id : null;
      const name = typeof entry.name === 'string' ? entry.name : null;
      if (!id || !name) return null;
      const icon = typeof entry.icon === 'string' ? entry.icon : null;
      const banner = typeof entry.banner === 'string' ? entry.banner : null;
      const owner = typeof entry.owner === 'boolean' ? entry.owner : false;
      const features = Array.isArray(entry.features)
        ? entry.features.filter((item): item is string => typeof item === 'string')
        : [];
      return { id, name, icon, banner, owner, features };
    })
    .filter((entry): entry is DemoGuildEntry => entry !== null);
};

const normalizeDemoGuilds = (guilds: DemoGuildEntry[]): ApiGuild[] =>
  guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    banner: guild.banner,
    owner: guild.owner,
    features: guild.features,
  }));

const setDemoStatus = (message: string, variant: 'neutral' | 'error' = 'neutral'): void => {
  demoStatus.textContent = message;
  demoStatus.classList.toggle('is-error', variant === 'error');
};

const setImportStatus = (message: string, variant: 'neutral' | 'error' = 'neutral'): void => {
  importStatus.textContent = message;
  importStatus.classList.toggle('is-error', variant === 'error');
};

const updateImportModalCopy = (): void => {
  setImportStatus('', 'neutral');
  importGuildsCard.classList.toggle('hidden', !isDemoMode);
  if (isDemoMode) {
    importCopy.textContent =
      'Import your Discord data. Start with your server list, then optionally restore your backup.';
    importUserCopy.textContent =
      'Restore favorites, notes, nicknames, and widgets from a backup.';
    importUserMeta.textContent = 'Optional in demo mode.';
    importGuildsMeta.textContent = 'Optional if you have it.';
    importUserLabel.textContent = 'Optional';
    importUserLabel.classList.remove('hidden');
  } else {
    importCopy.textContent = 'Restore your favorites, notes, nicknames, and widgets from a backup.';
    importUserCopy.textContent =
      'Export your user data from the app to create a backup, then restore it here.';
    importUserMeta.textContent = '';
    importUserLabel.textContent = '';
    importUserLabel.classList.add('hidden');
  }
};

const openImportModal = (trigger?: HTMLElement | null): void => {
  updateImportModalCopy();
  importModal.open(trigger);
};

const setDemoModalStatus = (
  message: string,
  variant: 'neutral' | 'error' = 'neutral',
): void => {
  demoModalStatus.textContent = message;
  demoModalStatus.classList.toggle('is-error', variant === 'error');
};

const saveDemoGuilds = (guilds: ApiGuild[]): void => {
  localStorage.setItem(DEMO_GUILDS_KEY, JSON.stringify(guilds));
};

const loadDemoGuilds = (): ApiGuild[] | null => {
  try {
    const stored = localStorage.getItem(DEMO_GUILDS_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    const demoGuilds = parseDemoGuilds(parsed);
    if (demoGuilds.length === 0) return null;
    return normalizeDemoGuilds(demoGuilds);
  } catch (error) {
    console.error('Failed to load demo guilds', error);
    return null;
  }
};

const ensureDemoWidgetCache = (guilds: ApiGuild[], data: UserDataStore): UserDataStore => {
  const widgetCache = { ...data.widgetCache };
  let updated = false;
  guilds.forEach((guild) => {
    if (!widgetCache[guild.id]) {
      widgetCache[guild.id] = {
        instantInvite: null,
        presenceCount: null,
        lastCached: null,
      };
      updated = true;
    }
  });

  if (!updated) {
    return data;
  }

  const next = { ...data, widgetCache };
  saveUserData(next, storageOptions);
  return next;
};

const createDemoUserData = (guilds: ApiGuild[]): UserDataStore => {
  const base = createDefaultUserData();
  const widgetCache = guilds.reduce<Record<string, WidgetCacheEntry>>((acc, guild) => {
    acc[guild.id] = {
      instantInvite: null,
      presenceCount: null,
      lastCached: null,
    };
    return acc;
  }, {});
  const next = { ...base, widgetCache };
  saveUserData(next, storageOptions);
  return next;
};

const createCopyHandler = (
  button: HTMLButtonElement,
  getText: () => string,
): (() => Promise<void>) => {
  let timeoutId: number | undefined;
  const originalLabel = button.getAttribute('aria-label') ?? 'Copy code to clipboard';

  return async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(getText());

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      button.classList.add('is-copied');
      button.setAttribute('aria-label', 'Copied!');
      const icon = button.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
      }

      timeoutId = window.setTimeout(() => {
        button.classList.remove('is-copied');
        button.setAttribute('aria-label', originalLabel);
        if (icon) {
          icon.classList.remove('fa-check');
          icon.classList.add('fa-copy');
        }
        timeoutId = undefined;
      }, 2000);
    } catch {
      showToast('Unable to copy code', { variant: 'error' });
    }
  };
};

const attachFilterTooltips = (): void => {
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    if (button.closest('.tooltip-anchor')) {
      return;
    }
    const filter = button.dataset.filter as FilterKey | undefined;
    if (!filter) {
      return;
    }
    const tooltipText = filterTooltipCopy[filter];
    if (!tooltipText) {
      return;
    }
    const anchor = createElement('span', 'tooltip-anchor is-tooltip-active');
    const tooltip = createElement('span', 'tooltip-pill', tooltipText);
    const tooltipId = `filter-tooltip-${filter}`;
    tooltip.id = tooltipId;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'false');
    const parent = button.parentElement;
    if (!parent) {
      return;
    }
    parent.insertBefore(anchor, button);
    anchor.append(button, tooltip);
    button.setAttribute('aria-describedby', tooltipId);
  });
};

const applyDemoData = (guilds: ApiGuild[], options?: { resetUserData?: boolean }): void => {
  state.guilds = guilds;
  state.userData = options?.resetUserData
    ? createDemoUserData(guilds)
    : ensureDemoWidgetCache(guilds, loadUserData(storageOptions));
  setScreen('app');
  render();
};

const handleDemoFile = async (file: File): Promise<boolean> => {
  const filename = file.name;
  setDemoStatus(`Loading ${filename}...`, 'neutral');
  setImportStatus(`Loading ${filename}...`, 'neutral');
  setDemoModalStatus(`Selected: ${filename}`, 'neutral');
  try {
    const content = await file.text();
    const parsed: unknown = JSON.parse(content);
    const demoGuilds = parseDemoGuilds(parsed);
    if (demoGuilds.length === 0) {
      throw new Error('No guilds found');
    }
    const guilds = normalizeDemoGuilds(demoGuilds);
    saveDemoGuilds(guilds);
    const shouldResetUserData = !demoUserDataLoaded;
    applyDemoData(guilds, { resetUserData: shouldResetUserData });
    setDemoStatus('Loaded.', 'neutral');
    setImportStatus('Loaded.', 'neutral');
    setDemoModalStatus('Loaded.', 'neutral');
    return true;
  } catch (error) {
    console.error(error);
    setDemoStatus('Invalid file. Expect guilds_api.json.', 'error');
    setImportStatus('Invalid file. Expect guilds_api.json.', 'error');
    setDemoModalStatus('Invalid file. Expect guilds_api.json.', 'error');
    return false;
  }
};

const setupDemoMode = (): void => {
  if (!isDemoMode) return;
  loginActions.classList.add('hidden');
  demoLoader.classList.remove('hidden');
  importTooltip.textContent = 'Import user_data.json';
};

const hydrateDemo = (): void => {
  const storedGuilds = loadDemoGuilds();
  if (!storedGuilds) {
    setDemoStatus('Load guilds_api.json to continue.', 'neutral');
    setScreen('login');
    return;
  }
  applyDemoData(storedGuilds, { resetUserData: false });
};

const setupEvents = (): void => {
  attachFilterTooltips();
  initializeSectionStates();
  
  document.querySelectorAll<HTMLButtonElement>('[data-collapse-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionKey = button.dataset.collapseToggle as SectionKey | undefined;
      if (sectionKey) {
        toggleSectionCollapse(sectionKey);
      }
    });
  });
  
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter as FilterKey | undefined;
      if (filter) {
        toggleFilter(filter);
      }
    });
  });

  const filterClearButton = document.getElementById('filter-clear');
  if (filterClearButton) {
    filterClearButton.addEventListener('click', clearFilters);
  }

  searchInput.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    updateSearch(target.value);
  });

  getElement<HTMLButtonElement>('btn-export').addEventListener('click', handleExport);

  if (!isDemoMode) {
    fetchButton.addEventListener('click', () => {
      updateFetchSkipInfo();
      fetchModal.open();
    });
    // Initialize cooldown state
    updateFetchButtonState();
    updateFetchLastRunDisplay();
    startCooldownTimer();
  } else {
    fetchButton.disabled = true;
    fetchButton.setAttribute('aria-disabled', 'true');
    fetchTooltipAnchor.classList.add('is-tooltip-active');
    fetchTooltipAnchor.setAttribute('tabindex', '0');
    fetchTooltipAnchor.setAttribute('aria-describedby', 'fetch-tooltip');
    fetchTooltip.setAttribute('aria-hidden', 'false');
  }

  getElement<HTMLButtonElement>('btn-logout').addEventListener('click', async () => {
    if (isDemoMode) {
      setScreen('login');
      setDemoStatus('Load guilds_api.json to continue.', 'neutral');
      return;
    }
    try {
      await logout();
    } catch (error) {
      console.error(error);
    } finally {
      setScreen('login');
    }
  });

  importButton.addEventListener('click', (event) => {
    openImportModal(event.currentTarget as HTMLElement);
  });

  importInstructionsLink.addEventListener('click', (event) => {
    instructionsModal.open(event.currentTarget as HTMLElement);
  });

  const handleInstructionsCodeCopy = createCopyHandler(
    instructionsCodeCopy,
    () => instructionsCodeSnippet.textContent ?? '',
  );
  instructionsCodeCopy.addEventListener('click', handleInstructionsCodeCopy);

  demoInstructionsLink.addEventListener('click', (event) => {
    instructionsModal.open(event.currentTarget as HTMLElement);
  });

  demoImportButton.addEventListener('click', (event) => {
    setDemoModalStatus('', 'neutral');
    demoModal.open(event.currentTarget as HTMLElement);
  });

  importUserInput.addEventListener('change', () => {
    const file = importUserInput.files?.[0];
    if (!file) {
      return;
    }
    const handleImportFlow = async (): Promise<void> => {
      const success = await handleImport(file);
      if (success) {
        if (!(isDemoMode && loginScreen.getAttribute('aria-hidden') === 'false')) {
          importModal.close();
        }
      }
    };
    void handleImportFlow();
    importUserInput.value = '';
  });

  importGuildsInput.addEventListener('change', () => {
    const file = importGuildsInput.files?.[0];
    if (!file) {
      return;
    }
    const handleImportFlow = async (): Promise<void> => {
      const success = await handleDemoFile(file);
      if (success) {
        demoUserDataLoaded = false;
        importModal.close();
      }
    };
    void handleImportFlow();
    importGuildsInput.value = '';
  });

  demoGuildsInput.addEventListener('change', () => {
    const file = demoGuildsInput.files?.[0];
    if (!file) {
      return;
    }
    const handleImportFlow = async (): Promise<void> => {
      const success = await handleDemoFile(file);
      if (success) {
        demoUserDataLoaded = false;
        demoModal.close();
      }
    };
    void handleImportFlow();
    demoGuildsInput.value = '';
  });

  fetchStart.addEventListener('click', () => {
    void performWidgetFetch();
  });
  fetchInlineStop.addEventListener('click', () => {
    fetchShouldStop = true;
  });
  fetchForce.addEventListener('change', updateFetchSkipInfo);
};

const hydrateApp = async (): Promise<void> => {
  try {
    const me = await fetchMe();
    state.me = me.username;
  } catch (error) {
    if (error instanceof AuthError) {
      setScreen('login');
      return;
    }
    setScreen('app');
    showToast('Unable to verify session', { variant: 'error' });
    return;
  }

  setScreen('app');

  try {
    state.guilds = await fetchGuilds();
    render();
  } catch (error) {
    if (error instanceof AuthError) {
      setScreen('login');
      return;
    }
    showToast('Unable to load servers', { variant: 'error' });
  }
};


setFooterYear();
setFooterBuildInfo();
setupEvents();
setupDemoMode();
if (isDemoMode) {
  hydrateDemo();
} else {
  void hydrateApp();
}
