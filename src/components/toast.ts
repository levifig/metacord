export type ToastVariant = 'success' | 'error' | 'info';

interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastManager {
  show: (message: string, options?: ToastOptions) => void;
}

export const createToastManager = (container: HTMLElement): ToastManager => {
  const show = (message: string, options: ToastOptions = {}): void => {
    const toast = document.createElement('div');
    const variant = options.variant ?? 'success';
    toast.className = `toast ${variant}`;
    toast.textContent = message;
    container.appendChild(toast);
    const duration = options.duration ?? 3000;
    window.setTimeout(() => {
      toast.remove();
    }, duration);
  };

  return { show };
};
