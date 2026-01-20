export const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }
  return `${value}`;
};

export const getIconUrl = (guildId: string, iconHash?: string | null): string | null => {
  if (!iconHash) return null;
  const extension = iconHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${extension}`;
};

export const getBannerUrl = (guildId: string, bannerHash?: string | null): string | null => {
  if (!bannerHash) return null;
  return `https://cdn.discordapp.com/banners/${guildId}/${bannerHash}.png?size=480`;
};

export const createElement = <T extends keyof HTMLElementTagNameMap>(
  tag: T,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[T] => {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
};

export const safelySetText = (element: HTMLElement, value: string): void => {
  element.textContent = value;
};
