const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export interface ModalController {
  open: (trigger?: HTMLElement | null) => void;
  close: () => void;
  isOpen: () => boolean;
}

export const createModalController = (overlay: HTMLElement): ModalController => {
  const dialog = overlay.querySelector<HTMLElement>('.modal');
  if (!dialog) {
    throw new Error('Modal dialog missing');
  }

  let lastFocused: HTMLElement | null = null;

  const getFocusable = (): HTMLElement[] =>
    Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = getFocusable();
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  };

  const open = (trigger?: HTMLElement | null): void => {
    if (overlay.classList.contains('is-open')) {
      return;
    }
    lastFocused = trigger ?? (document.activeElement as HTMLElement | null);
    overlay.classList.remove('hidden');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      const focusable = getFocusable();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }, 0);
    document.addEventListener('keydown', handleKeydown);
  };

  const close = (): void => {
    if (!overlay.classList.contains('is-open')) {
      return;
    }
    overlay.classList.remove('is-open');
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleKeydown);
    if (lastFocused) {
      lastFocused.focus();
    }
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  overlay.querySelectorAll<HTMLElement>('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', () => close());
  });

  return {
    open,
    close,
    isOpen: () => overlay.classList.contains('is-open'),
  };
};
