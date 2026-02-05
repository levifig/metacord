import {
  AuthError,
  type ApiGuildMember,
} from './api';
import {
  toggleFavorite,
  updateNickname,
  updateNotes,
  assignServerToCategory,
  type WidgetCacheEntry,
} from './storage';
import { createServerCard, type ServerView, type ServerCardOptions } from '../components/serverCard';
import type { ModalController } from '../components/modal';
import type { ToastManager } from '../components/toast';
import { createElement, getIconUrl } from './utils';
import { fetchGuildMember } from './api';
import {
  type DynamicSectionKey,
  type FilterKey,
  type SortKey,
  type SectionElements,
  collapsedSections,
  getElement,
  getSections,
  isDemoMode,
  registerDynamicSection,
  clearDynamicSections,
  saveCollapsedSections,
  state,
  storageOptions,
} from './state';

// Re-export ServerView for convenience
export type { ServerView } from '../components/serverCard';

// --- Toast integration ---

let _toast: ToastManager | null = null;
let _appShell: HTMLElement | null = null;

export const initShowToast = (toast: ToastManager, appShell: HTMLElement): void => {
  _toast = toast;
  _appShell = appShell;
};

export const showToast: ToastManager['show'] = (message, options) => {
  if (!_toast || !_appShell) return;
  if (_appShell.getAttribute('aria-hidden') === 'true') {
    return;
  }
  _toast.show(message, options);
};

// --- Screen switching ---

let _closeAppOverlays: (() => void) | null = null;

export const initSetScreen = (closeAppOverlays: () => void): void => {
  _closeAppOverlays = closeAppOverlays;
};

export const setScreen = (screen: 'login' | 'app'): void => {
  const loginScreen = getElement<HTMLElement>('login-screen');
  const appShell = getElement<HTMLElement>('app-shell');
  const isLogin = screen === 'login';
  loginScreen.setAttribute('aria-hidden', isLogin ? 'false' : 'true');
  appShell.setAttribute('aria-hidden', isLogin ? 'true' : 'false');
  loginScreen.classList.toggle('hidden', !isLogin);
  appShell.classList.toggle('hidden', isLogin);
  if (isLogin) {
    _closeAppOverlays?.();
  }
  if (!isLogin) {
    document.querySelectorAll<HTMLElement>('[data-animate]').forEach((el) => {
      el.classList.add('fade-up');
    });
  }
};

// --- Import status ---

export const setImportStatus = (message: string, variant: 'neutral' | 'error' = 'neutral'): void => {
  const importStatus = getElement<HTMLElement>('import-status');
  importStatus.textContent = message;
  importStatus.classList.toggle('is-error', variant === 'error');
};

// --- Filtering & sorting helpers ---

export const hasBoost = (features: string[]): boolean =>
  features.includes('ANIMATED_ICON') || features.includes('ANIMATED_BANNER');

export const getWidgetView = (guildId: string): WidgetCacheEntry | null => {
  return state.userData.widgetCache[guildId] ?? null;
};

export const buildServerViews = (): ServerView[] => {
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

export const matchesSingleFilter = (server: ServerView, filter: FilterKey): boolean => {
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

export const matchesFilter = (server: ServerView, activeFilters: Set<FilterKey>): boolean => {
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

export const matchesSearch = (server: ServerView, query: string): boolean => {
  if (!query) return true;
  const value = query.toLowerCase();
  const nickname = server.nickname?.toLowerCase() ?? '';
  return server.name.toLowerCase().includes(value) || nickname.includes(value);
};

export const getDisplayName = (server: ServerView): string => server.nickname ?? server.name;

export const startsWithAlphanumeric = (value: string): boolean => /^[0-9a-z]/i.test(value.trim());

export const sortByName = (a: ServerView, b: ServerView): number => {
  const nameA = getDisplayName(a);
  const nameB = getDisplayName(b);
  return nameA.localeCompare(nameB);
};

export const sortByBannerThenName = (a: ServerView, b: ServerView): number => {
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

export const getSortComparator = (sortKey: SortKey): ((a: ServerView, b: ServerView) => number) => {
  switch (sortKey) {
    case 'name-desc':
      return (a, b) => {
        const nameA = getDisplayName(a);
        const nameB = getDisplayName(b);
        return nameB.localeCompare(nameA);
      };
    case 'online-desc':
      return (a, b) => {
        const countA = a.widget?.presenceCount ?? -1;
        const countB = b.widget?.presenceCount ?? -1;
        if (countA !== countB) return countB - countA;
        return getDisplayName(a).localeCompare(getDisplayName(b));
      };
    case 'name-asc':
    default:
      return sortByName;
  }
};

// --- Section rendering ---

let _detailsModal: ModalController | null = null;

export const initDetailsModal = (modal: ModalController): void => {
  _detailsModal = modal;
};

export const getVisibleServerIds = (): string[] => {
  const allViews = buildServerViews();
  const filtered = allViews.filter((server) =>
    matchesFilter(server, state.activeFilters) && matchesSearch(server, state.search.trim()),
  );
  return filtered.map((s) => s.id);
};

export const toggleSelection = (guildId: string): void => {
  if (state.selectedIds.has(guildId)) {
    state.selectedIds.delete(guildId);
  } else {
    state.selectedIds.add(guildId);
  }
  render();
};

const renderSection = (key: string, servers: ServerView[]): void => {
  const sections = getSections();
  const section = sections[key];
  if (!section) return;
  section.list.replaceChildren();
  section.count.textContent = `${servers.length}`;
  if (servers.length === 0) {
    section.section.classList.add('hidden');
    return;
  }
  section.section.classList.remove('hidden');
  servers.forEach((server) => {
    const cardOptions: ServerCardOptions | undefined = state.selectionMode
      ? { selectionMode: true, isSelected: state.selectedIds.has(server.id) }
      : undefined;
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
        onToggleSelection: (guildId) => toggleSelection(guildId),
      }, cardOptions),
    );
  });
};

// --- Dynamic category section creation ---

const createCategorySectionDOM = (categoryId: string, categoryName: string): SectionElements => {
  const sectionKey: DynamicSectionKey = `category-${categoryId}`;
  const section = createElement('section', 'section hidden');
  section.id = `${sectionKey}-section`;
  section.setAttribute('data-animate', '');

  const header = document.createElement('button');
  header.className = 'section-header';
  header.type = 'button';
  header.dataset.collapseToggle = sectionKey;
  const isCollapsed = collapsedSections.has(sectionKey);
  header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  header.setAttribute('aria-controls', `${sectionKey}-content`);

  const headerLeft = createElement('div', 'section-header-left');
  const chevron = createElement('span', 'section-chevron');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '&#9662;';
  const h2 = createElement('h2', '', categoryName);
  headerLeft.append(chevron, h2);

  const countPill = createElement('span', 'count-pill');
  countPill.id = `${sectionKey}-count`;
  countPill.textContent = '0';

  header.append(headerLeft, countPill);
  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    content.classList.toggle('is-collapsed', expanded);
    if (expanded) {
      collapsedSections.add(sectionKey);
    } else {
      collapsedSections.delete(sectionKey);
    }
    saveCollapsedSections(collapsedSections);
  });

  const content = createElement('div', 'section-content');
  content.id = `${sectionKey}-content`;
  if (isCollapsed) {
    content.classList.add('is-collapsed');
  }

  const list = createElement('div', 'server-grid server-grid--constrained');
  list.id = `${sectionKey}-list`;
  content.appendChild(list);

  section.append(header, content);

  return { section, list, count: countPill, content, header };
};

// --- Main render ---

export const render = (): void => {
  const allViews = buildServerViews();
  const filtered = allViews.filter((server) =>
    matchesFilter(server, state.activeFilters) && matchesSearch(server, state.search.trim()),
  );

  const comparator = getSortComparator(state.sort);
  const favorites = filtered.filter((server) => server.isFavorite).sort(comparator);

  // Build set of servers in custom categories (excluding favorites — favorites take priority)
  const categorizedIds = new Set<string>();
  const sortedCategories = [...state.userData.categories].sort((a, b) => a.order - b.order);

  // Remove old dynamic category sections from DOM and state registry
  const categoryContainer = document.getElementById('category-sections-container');
  if (categoryContainer) {
    categoryContainer.replaceChildren();
  }
  clearDynamicSections();

  // Render each category section
  for (const category of sortedCategories) {
    const sectionKey: DynamicSectionKey = `category-${category.id}`;
    const categoryServers = filtered.filter((server) => {
      if (server.isFavorite) return false;
      return state.userData.serverCategories[server.id] === category.id;
    }).sort(comparator);

    categoryServers.forEach((s) => categorizedIds.add(s.id));

    const elements = createCategorySectionDOM(category.id, category.name);
    registerDynamicSection(sectionKey, elements);
    categoryContainer?.appendChild(elements.section);
    renderSection(sectionKey, categoryServers);
  }

  const owned = filtered.filter((server) =>
    server.owner && !server.isFavorite && !categorizedIds.has(server.id),
  ).sort(comparator);
  const publicServers = filtered.filter((server) =>
    !server.owner && !server.isFavorite && !categorizedIds.has(server.id) && Boolean(server.widget?.instantInvite),
  ).sort(comparator);
  const privateServers = filtered.filter((server) =>
    !server.owner && !server.isFavorite && !categorizedIds.has(server.id) && !server.widget?.instantInvite,
  ).sort(comparator);

  renderSection('favorites', favorites);
  renderSection('owned', owned);
  renderSection('public', publicServers);
  renderSection('private', privateServers);

  const statTotal = getElement<HTMLElement>('stat-total');
  const statFavorites = getElement<HTMLElement>('stat-favorites');
  const statOwned = getElement<HTMLElement>('stat-owned');
  const statPublic = getElement<HTMLElement>('stat-public');
  const emptyState = getElement<HTMLElement>('empty-state');
  const searchHelper = getElement<HTMLElement>('search-helper');

  const favoritesTotal = allViews.filter((server) => server.isFavorite).length;
  const ownedTotal = allViews.filter((server) => server.owner).length;
  const publicTotal = allViews.filter((server) => server.widget?.instantInvite).length;
  statTotal.textContent = `${allViews.length}`;
  statFavorites.textContent = `${favoritesTotal}`;
  statOwned.textContent = `${ownedTotal}`;
  statPublic.textContent = `${publicTotal}`;

  emptyState.classList.toggle('hidden', allViews.length > 0);
  searchHelper.classList.toggle('hidden', state.search.trim().length > 0);

  // Update filter count badge
  const filterCount = document.getElementById('filter-count');
  if (filterCount) {
    const hasActiveFilters = state.activeFilters.size > 0 || state.search.trim().length > 0;
    if (hasActiveFilters && allViews.length > 0) {
      filterCount.textContent = `${filtered.length} of ${allViews.length} servers`;
      filterCount.classList.remove('hidden');
    } else {
      filterCount.textContent = '';
      filterCount.classList.add('hidden');
    }
  }

  // Update bulk action bar
  const bulkActions = document.getElementById('bulk-actions');
  const bulkCount = document.getElementById('bulk-count');
  const selectToggle = document.getElementById('btn-select-toggle');
  if (bulkActions && bulkCount) {
    const selectedCount = state.selectedIds.size;
    if (state.selectionMode && selectedCount > 0) {
      bulkActions.classList.remove('hidden');
      bulkCount.textContent = `${selectedCount} selected`;
    } else {
      bulkActions.classList.add('hidden');
      bulkCount.textContent = '';
    }
  }
  if (selectToggle) {
    selectToggle.classList.toggle('is-active', state.selectionMode);
    selectToggle.setAttribute('aria-pressed', state.selectionMode ? 'true' : 'false');
  }
};

// --- Details modal ---

export const openDetails = async (guildId: string): Promise<void> => {
  const server = state.guilds.find((item) => item.id === guildId);
  if (!server) return;
  const detailsBody = getElement<HTMLElement>('details-body');
  detailsBody.replaceChildren();

  const loading = createElement('p', 'muted', 'Loading server details...');
  detailsBody.appendChild(loading);
  _detailsModal?.open();

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

  const roles = member?.roles ?? [];
  const rolesSection = createElement('div', 'roles-section');
  const rolesHeader = createElement('div', 'roles-header');
  const rolesLabel = createElement('span', 'roles-label', `Roles (${roles.length})`);
  rolesHeader.appendChild(rolesLabel);
  rolesSection.appendChild(rolesHeader);

  if (roles.length > 0) {
    const rolesList = createElement('div', 'roles-list');
    rolesList.setAttribute('role', 'list');
    rolesList.setAttribute('aria-label', 'Role IDs');
    for (const roleId of roles) {
      const item = createElement('div');
      item.setAttribute('role', 'listitem');
      const badge = createElement('button', 'role-badge');
      badge.type = 'button';
      badge.textContent = roleId;
      badge.setAttribute('aria-label', `Role ID ${roleId}, click to copy`);
      badge.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(roleId);
          showToast('Role ID copied');
        } catch {
          showToast('Unable to copy role ID', { variant: 'error' });
        }
      });
      item.appendChild(badge);
      rolesList.appendChild(item);
    }
    rolesSection.appendChild(rolesList);
    const rolesNote = createElement('p', 'roles-note muted', 'Role names require bot permissions \u2014 showing role IDs');
    rolesSection.appendChild(rolesNote);
  } else {
    const noRoles = createElement('p', 'muted', 'No roles');
    rolesSection.appendChild(noRoles);
  }
  detailsBody.appendChild(rolesSection);

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

  // Category assignment dropdown
  const categoryField = createElement('div', 'form-field');
  const categoryLabel = createElement('label', '', 'Category');
  categoryLabel.setAttribute('for', 'category-select');
  const categorySelect = document.createElement('select');
  categorySelect.id = 'category-select';
  categorySelect.className = 'sort-select';

  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = 'None';
  categorySelect.appendChild(noneOption);

  const sortedCats = [...state.userData.categories].sort((a, b) => a.order - b.order);
  for (const cat of sortedCats) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    categorySelect.appendChild(opt);
  }
  categorySelect.value = state.userData.serverCategories[guildId] ?? '';
  categoryField.append(categoryLabel, categorySelect);
  detailsBody.appendChild(categoryField);

  const actions = createElement('div', 'modal-actions');
  const saveButton = createElement('button', 'btn btn-primary', 'Save');
  saveButton.type = 'button';
  saveButton.addEventListener('click', () => {
    state.userData = updateNickname(state.userData, guildId, nicknameInput.value, storageOptions);
    state.userData = updateNotes(state.userData, guildId, notesInput.value, storageOptions);
    const selectedCategory = categorySelect.value || null;
    state.userData = assignServerToCategory(state.userData, guildId, selectedCategory, storageOptions);
    showToast('Details saved');
    render();
    _detailsModal?.close();
  });
  const cancelButton = createElement('button', 'btn btn-secondary', 'Cancel');
  cancelButton.type = 'button';
  cancelButton.addEventListener('click', () => _detailsModal?.close());
  actions.append(saveButton, cancelButton);
  detailsBody.appendChild(actions);
};
