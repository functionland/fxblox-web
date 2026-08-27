/** Notifications — notifee replacement: no-op unless the user granted `Notification` permission. */

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export function permissionState(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showNotification(title: string, body?: string, opts: { tag?: string } = {}): boolean {
  if (permissionState() !== 'granted') return false;
  try {
    new Notification(title, { body, tag: opts.tag });
    return true;
  } catch {
    return false;
  }
}

export const notifications = { permissionState, requestPermission, showNotification };
