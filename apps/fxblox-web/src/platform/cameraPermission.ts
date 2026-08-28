/**
 * Camera permission (`navigator.permissions` + `getUserMedia`).
 *
 * Only Auto-Pin QR scanning needs it, and pasting the code always works instead — so this is genuinely
 * optional and must never block setup. It exists so the Requirements screen can ASK rather than explain: a
 * paragraph telling someone a prompt will appear is worse than a button that makes it appear.
 *
 * `permissions.query({name:'camera'})` is not universally implemented (Firefox notably), hence `unsupported`
 * as a distinct state from `denied` — we must not tell the user they refused something they were never asked.
 */

export type CameraPermission = 'pending' | 'granted' | 'denied' | 'prompt' | 'unsupported';

/** Current state without prompting. `prompt` means asking would show the browser dialog. */
export async function cameraPermissionState(): Promise<CameraPermission> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      return 'unsupported';
    }
    const perms = navigator.permissions;
    if (!perms?.query) return 'prompt'; // capable of asking, just can't introspect first
    const status = await perms.query({ name: 'camera' as PermissionName });
    return status.state as CameraPermission;
  } catch {
    // A browser that refuses the query still has getUserMedia; treat it as askable.
    return 'prompt';
  }
}

/**
 * Trigger the browser prompt. Call from a click.
 *
 * The stream is stopped immediately — we only want the grant recorded, not a live camera. Leaving tracks open
 * would light the camera indicator on a screen that shows no viewfinder, which reads as spyware.
 */
export async function requestCameraPermission(): Promise<CameraPermission> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      return 'unsupported';
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of stream.getTracks()) track.stop();
    return 'granted';
  } catch (e) {
    // NotAllowedError = the user (or policy) said no. Anything else — no camera attached, hardware busy —
    // is not a refusal, and calling it one would be a lie.
    const name = (e as { name?: string } | null)?.name;
    return name === 'NotAllowedError' ? 'denied' : 'unsupported';
  }
}
