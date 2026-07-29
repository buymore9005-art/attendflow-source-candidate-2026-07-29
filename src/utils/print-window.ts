export type OpenWindow = (url?: string | URL, target?: string, features?: string) => Window | null;

export function openPrintWindow(
  features: string,
  openWindow: OpenWindow = window.open.bind(window)
): Window {
  const popup = openWindow('', '_blank', features);
  if (!popup) throw new Error('error.popupBlocked');
  popup.opener = null;
  return popup;
}
