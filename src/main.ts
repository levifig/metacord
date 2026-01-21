import {
  AuthError,
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
  updateNickname,
  updateNotes,
  updateWidgetCache,
  type UserDataStore,
  type WidgetCacheEntry,
} from './lib/storage';
import { createModalController } from './components/modal';
import { createServerCard, type ServerView } from './components/serverCard';
import { createToastManager, type ToastManager } from './components/toast';
import { createElement, getIconUrl } from './lib/utils';

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
const detailsBody = getElement<HTMLElement>('details-body');

const importButton = getElement<HTMLButtonElement>('btn-import');
const importTooltip = getElement<HTMLElement>('import-tooltip');
const importModalTitle = getElement<HTMLElement>('import-title');
const importModalCopy = getElement<HTMLElement>('import-copy');
const importUserCopy = getElement<HTMLElement>('import-user-copy');
const importUserMeta = getElement<HTMLElement>('import-user-meta');
const importGuildsCopy = getElement<HTMLElement>('import-guilds-copy');
const importGuildsMeta = getElement<HTMLElement>('import-guilds-meta');
const importUserInput = getElement<HTMLInputElement>('import-user-input');
const importGuildsInput = getElement<HTMLInputElement>('import-guilds-input');
const importStatus = getElement<HTMLElement>('import-status');
const instructionsLink = getElement<HTMLAnchorElement>('instructions-link');

const getFetchStep = (step: string): HTMLElement => {
  const element = getElement<HTMLElement>('fetch-modal').querySelector<HTMLElement>(
    `[data-fetch-step="${step}"]`,
  );
  if (!element) {
    throw new Error(`Missing fetch step: ${step}`);
  }
  return element;
};

const fetchIntro = getFetchStep('intro');
const fetchProgress = getFetchStep('progress');
const fetchComplete = getFetchStep('complete');
const fetchSkipInfo = getElement<HTMLElement>('fetch-skip-info');
const fetchForce = getElement<HTMLInputElement>('fetch-force');
const fetchStart = getElement<HTMLButtonElement>('fetch-start');
const fetchStop = getElement<HTMLButtonElement>('fetch-stop');
const fetchButton = getElement<HTMLButtonElement>('btn-fetch');
const fetchTooltipAnchor = getElement<HTMLElement>('fetch-tooltip-anchor');
const fetchTooltip = getElement<HTMLElement>('fetch-tooltip');
const fetchProgressText = getElement<HTMLElement>('fetch-progress-text');
const fetchProgressDetail = getElement<HTMLElement>('fetch-progress-detail');
const fetchProgressBar = getElement<HTMLElement>('fetch-progress-bar');
const fetchCompleteText = getElement<HTMLElement>('fetch-complete-text');

let fetchShouldStop = false;
let demoUserDataLoaded = false;

const showToast: ToastManager['show'] = (message, options) => {
  if (appShell.getAttribute('aria-hidden') === 'true') {
    return;
  }
  toast.show(message, options);
};

const closeAppOverlays = (): void => {
  fetchShouldStop = true;
  importModal.close();
  fetchModal.close();
  detailsModal.close();
  instructionsModal.close();
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
  const servers = buildServerViews();
  const filtered = servers.filter((server) =>
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

  const allViews = buildServerViews();
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

const updateFetchModalStep = (step: 'intro' | 'progress' | 'complete'): void => {
  if (fetchIntro && fetchProgress && fetchComplete) {
    fetchIntro.classList.toggle('hidden', step !== 'intro');
    fetchProgress.classList.toggle('hidden', step !== 'progress');
    fetchComplete.classList.toggle('hidden', step !== 'complete');
  }
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

const performWidgetFetch = async (): Promise<void> => {
  if (isDemoMode) {
    showToast('Demo mode uses local data only.');
    return;
  }
  fetchShouldStop = false;
  updateFetchModalStep('progress');
  fetchProgressBar.classList.remove('is-stopped');
  fetchProgressBar.style.width = '0%';
  fetchProgressText.textContent = 'Fetching server info...';
  fetchProgressDetail.textContent = '';
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

  if (total === 0) {
    updateFetchModalStep('complete');
    fetchCompleteText.textContent = 'All servers are already cached. Enable "Clear cached results" to refetch.';
    return;
  }

  for (const guildId of targets) {
    if (fetchShouldStop) {
      fetchProgressBar.classList.add('is-stopped');
      break;
    }
    try {
      const widget = await fetchWidget(guildId);
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
    } catch (error) {
      if (error instanceof AuthError) {
        setScreen('login');
        return;
      }
      const entry: WidgetCacheEntry = {
        instantInvite: null,
        presenceCount: null,
        lastCached: new Date().toISOString(),
      };
      state.userData = updateWidgetCache(state.userData, guildId, entry, storageOptions);
      errors += 1;
    }
    completed += 1;
    const progress = total === 0 ? 100 : Math.round((completed / total) * 100);
    fetchProgressBar.style.width = `${progress}%`;
    fetchProgressText.textContent = `Fetching server info (${completed}/${total})`;
    fetchProgressDetail.textContent = `${widgetsEnabled} with public data`;
  }

  updateFetchModalStep('complete');
  const parts: string[] = [];
  if (widgetsEnabled > 0) parts.push(`${widgetsEnabled} with public widgets`);
  if (widgetsDisabled > 0) parts.push(`${widgetsDisabled} widgets disabled`);
  if (errors > 0) parts.push(`${errors} errors`);
  const summary = parts.length > 0 ? parts.join(', ') : 'No data found';
  fetchCompleteText.textContent = fetchShouldStop
    ? `Stopped early. ${summary}.`
    : `Complete. ${summary}.`;
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

const updateImportModalCopy = (source: 'login' | 'app'): void => {
  setImportStatus('', 'neutral');
  const isDemoImport = isDemoMode;
  importModalTitle.textContent = isDemoImport ? 'Load demo data' : 'Import data';
  importModalCopy.textContent = isDemoImport
    ? 'Load guilds_api.json to enter demo mode. user_data.json is optional.'
    : 'Choose what you want to import.';
  if (isDemoImport) {
    importUserCopy.textContent =
      'Restore favorites, notes, nicknames, and widgets from a backup.';
    importUserMeta.textContent = 'Optional in demo mode.';
    importGuildsCopy.textContent =
      'Export from the Discord API /users/@me/guilds endpoint or use the legacy export.';
    importGuildsMeta.textContent = 'Required to enter demo mode.';
  } else {
    importUserCopy.textContent =
      'Restore favorites, notes, nicknames, and widgets from a backup.';
    importUserMeta.textContent = 'Primary import.';
    importGuildsCopy.textContent =
      'Export from the Discord API /users/@me/guilds endpoint or use the legacy export.';
    importGuildsMeta.textContent = 'Optional if you have it.';
  }
};

const openImportModal = (source: 'login' | 'app', trigger?: HTMLElement | null): void => {
  updateImportModalCopy(source);
  importModal.open(trigger);
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
  setDemoStatus('Loading...', 'neutral');
  setImportStatus('Loading...', 'neutral');
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
    return true;
  } catch (error) {
    console.error(error);
    setDemoStatus('Invalid file. Expect guilds_api.json.', 'error');
    setImportStatus('Invalid file. Expect guilds_api.json.', 'error');
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
    fetchTooltip.setAttribute('aria-hidden', 'true');
    fetchButton.addEventListener('click', () => {
      updateFetchModalStep('intro');
      updateFetchSkipInfo();
      fetchModal.open();
    });
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
    openImportModal('app', event.currentTarget as HTMLElement);
  });

  instructionsLink.addEventListener('click', (event) => {
    event.preventDefault();
    instructionsModal.open(event.currentTarget as HTMLElement);
  });

  demoImportButton.addEventListener('click', (event) => {
    openImportModal('login', event.currentTarget as HTMLElement);
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

  fetchStart.addEventListener('click', () => {
    void performWidgetFetch();
  });
  fetchStop.addEventListener('click', () => {
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
