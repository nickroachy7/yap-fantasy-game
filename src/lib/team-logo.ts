/**
 * A manager's own picture, from their photo library to a public URL.
 *
 * ---------------------------------------------------------------------------
 * ONE OBJECT PER MANAGER, AT A PATH THAT NEVER CHANGES
 * ---------------------------------------------------------------------------
 *
 * `<uid>/logo.jpg`, overwritten in place. The first path segment is the owner's
 * id, which is what makes the storage policies in
 * `20260906000000_a_manager_can_upload_a_logo.sql` one line each — the
 * authorisation check is the path.
 *
 * Overwriting rather than versioning the filename means a manager who changes
 * their logo six times leaves one object behind, not six. Nothing in this app
 * sweeps up orphaned storage objects, and a feature that quietly accumulates
 * them is a bill nobody has agreed to pay.
 *
 * The cost of a fixed path is that the URL is also fixed, and BOTH Supabase's
 * CDN and `expo-image`'s cache key on the URL — so a new logo at an old URL is
 * a new logo that nobody sees. `?v=` is the answer, and the number behind it is
 * the monotonic counter the migration argues for at length.
 *
 * ---------------------------------------------------------------------------
 * RESIZED BEFORE IT LEAVES THE PHONE
 * ---------------------------------------------------------------------------
 *
 * This is drawn at 28pt in a leaderboard row. A modern phone photograph is
 * twelve megapixels, and fifty of those on one board is a screen that takes
 * visible seconds to fill over cellular — for pictures the size of a thumbnail.
 *
 * `LOGO_PX` is the one number that decides it, and 512 is chosen against the
 * largest place a logo is drawn (the account page's 64pt frame) at a 3x device
 * scale, doubled for headroom. The square crop happens in the picker's own
 * editing UI, so the resize below is not cropping anything — it is only ever
 * scaling a square down.
 *
 * ---------------------------------------------------------------------------
 * BASE64 ON BOTH PLATFORMS, RATHER THAN A BLOB ON ONE
 * ---------------------------------------------------------------------------
 *
 * The obvious upload is `fetch(uri).then(r => r.blob())`, and it works on web.
 * On native `file://` URIs it is the long-standing sharp edge in this exact
 * combination — React Native's `fetch` has historically returned blobs that
 * `supabase-js` uploads as zero bytes, silently, with a 200 back.
 *
 * So: ask the manipulator for base64, decode it here, upload the bytes. One
 * path, no platform branch, and no dependence on which polyfills happen to be
 * present — `atob` is deliberately not used for the same reason.
 *
 * ---------------------------------------------------------------------------
 * THE TWO NATIVE MODULES ARE LOADED LAZILY, AND THAT IS NOT AN OPTIMISATION
 * ---------------------------------------------------------------------------
 *
 * `expo-image-picker` and `expo-image-manipulator` both call
 * `requireNativeModule` AT MODULE SCOPE, which throws when the native side is
 * not in the binary. This file is imported by `TeamLogo`, which is imported by
 * the rail, the tab bar and every board — so a top-level import of either one
 * puts them on the startup path of the whole app.
 *
 * That matters because of how this app ships. A push to main publishes an
 * over-the-air JavaScript update to installs whose BINARY is whatever was last
 * uploaded to TestFlight, and these two modules arrived after that binary. A
 * static import would therefore have thrown during the first import of the
 * first screen: not a broken button, a launch crash, on every existing tester's
 * phone, from a change that reads as pure JavaScript.
 *
 * Behind a dynamic import the same update is harmless. Logos still DISPLAY on
 * an old binary — that is `expo-image`, which has been in the app for months —
 * and the only thing that cannot work is choosing a new one, which says so.
 *
 * ---------------------------------------------------------------------------
 * AND THE BINARY IS ASKED BEFORE ANYTHING IS IMPORTED
 * ---------------------------------------------------------------------------
 *
 * The lazy import above was the first version of this guard, and it was not
 * enough. It still IMPORTS the two packages and relies on the failure being a
 * catchable JavaScript error; beta users on build 5 — which has neither native
 * module, verified in the archive — crashed on the button anyway.
 *
 * `requireOptionalNativeModule` removes the reliance. It lives in
 * `expo-modules-core`, which is in every binary this app has ever shipped, and
 * it RETURNS NULL rather than throwing for a module that is not there. So the
 * question "can this binary do it" is answered without loading, touching or
 * constructing anything belonging to the missing modules.
 *
 * The names are the NATIVE ones and they are not the package names:
 * `ExponentImagePicker` (not `Expo…`) and `ExpoImageManipulator`. Both are
 * copied from the packages' own `requireNativeModule` calls; getting one wrong
 * would report "cannot" on a binary that can, which fails safe but silently.
 *
 * WEB IS EXEMPT FROM THE WHOLE QUESTION, and missing that broke it once.
 * Both packages ship a web implementation as a PLAIN OBJECT — a file input in
 * `ExponentImagePicker.web.ts`, a canvas in the manipulator's — which never
 * goes near `requireNativeModule`. So the probe answers null on web for a build
 * that is perfectly capable, and the first version of this guard disabled
 * upload on the website, where it had been working since the day it shipped.
 * There is no binary on the web and therefore nothing to be out of date.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { supabase } from './supabase';

export const LOGO_BUCKET = 'team-logos';

/** See the header. The stored square's side, in pixels. */
const LOGO_PX = 512;

/**
 * JPEG quality. 0.85 is where a 512px square stops getting visibly better and
 * carries on getting bigger; the result is reliably under 100 KB, which is two
 * orders of magnitude inside the bucket's 2 MiB ceiling.
 */
const LOGO_QUALITY = 0.85;

/**
 * WHAT A ROW NEEDS TO KNOW to draw somebody's logo: whether there is one, and
 * which generation of it.
 *
 * Deliberately not a URL. A URL is derived from an id and this pair, and having
 * every caller carry the derivation rather than the facts is what lets the
 * batch reader in `use-team-logos.ts` hold one small record per manager instead
 * of a string built for a size it cannot know.
 */
export type LogoMark = {
  hasLogo: boolean;
  /** Rises on every upload, never on a clear. See the migration. */
  version: number;
};

export const NO_LOGO: LogoMark = { hasLogo: false, version: 0 };

/** The object path for a manager. Also the shape the storage policies check. */
export function logoPath(userId: string): string {
  return `${userId}/logo.jpg`;
}

/**
 * The public URL for a manager's logo, or null if they have not set one.
 *
 * NULL RATHER THAN A PLACEHOLDER URL, so the one decision every caller has to
 * make — picture or initials — is made by the type rather than by a failed
 * image load. A component that falls back on `onError` shows a broken frame for
 * as long as the request takes.
 */
export function teamLogoUrl(userId: string, mark: LogoMark | undefined): string | null {
  if (!mark?.hasLogo) return null;
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath(userId));
  /* See the header: the path is fixed, so this is the only thing standing
     between a new logo and every cache that has seen the old one. */
  return `${data.publicUrl}?v=${mark.version}`;
}

/**
 * Base64 to bytes, without `atob` or a dependency.
 *
 * An `ArrayBuffer` rather than the view over it, because that is the body shape
 * `supabase-js` storage uploads are documented against on React Native — and
 * because a view can be a WINDOW onto a larger buffer, which would upload
 * trailing rubbish the caller never asked to send.
 */
function decodeBase64(input: string): ArrayBuffer {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let out = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | ALPHABET.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out] = (buffer >> bits) & 0xff;
      out += 1;
    }
  }
  return out === bytes.length ? bytes.buffer : bytes.buffer.slice(0, out);
}

/**
 * What `chooseTeamLogo` can end in. Cancelling is NOT an error and must not be
 * reported as one — backing out of the system picker is the most ordinary
 * thing a person can do in it, and an app that says "something went wrong"
 * afterwards is accusing them of a mistake they did not make.
 */
export type LogoOutcome =
  | { status: 'set'; mark: LogoMark }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const DENIED =
  'Yap Fantasy needs access to your photos to set a logo. You can turn it on in Settings.';

/**
 * What an old binary gets instead of a crash. See the header — it is worth
 * naming the update rather than saying "something went wrong", because the fix
 * is entirely on the reader's side and they can act on it.
 */
const NEEDS_BUILD = 'Setting a logo needs a newer version of the app.';

/**
 * Whether THIS BINARY can pick and resize an image at all.
 *
 * Cheap, synchronous and safe to call during render — which is the point. The
 * account page asks before drawing the control, so a build that cannot honour
 * the button does not offer it. A caught error after the press would have been
 * the app inviting somebody to do something it knows it cannot do.
 *
 * See the header for why this and not a try/catch around the import.
 */
export function canChooseTeamLogo(): boolean {
  /* See the header. The web build implements both of these in JavaScript, so
     the native probe below is not merely unnecessary there — it is wrong. */
  if (Platform.OS === 'web') return true;
  return (
    requireOptionalNativeModule('ExponentImagePicker') != null &&
    requireOptionalNativeModule('ExpoImageManipulator') != null
  );
}

/**
 * The picker and the manipulator, or nothing.
 *
 * Both are imported HERE rather than at the top of the file, and the whole
 * argument for that is in the header. `null` on failure rather than a throw,
 * because a missing native module is an expected state on an out-of-date
 * install and not an error to report as one.
 */
async function nativeImaging() {
  try {
    const [picker, manipulator] = await Promise.all([
      import('expo-image-picker'),
      import('expo-image-manipulator'),
    ]);
    return { picker, manipulator };
  } catch {
    return null;
  }
}

/**
 * Pick a square, shrink it, upload it, and only THEN publish the new version.
 *
 * THE ORDER IS THE WHOLE FUNCTION. `set_team_logo` is what makes a logo visible
 * to every other reader, so bumping it before the bytes land publishes a
 * version number for an object that may never arrive — and every board drawing
 * that manager spends the gap fetching a 404. Upload first, announce second.
 */
export async function chooseTeamLogo(userId: string): Promise<LogoOutcome> {
  try {
    /* ASKED BEFORE ANYTHING IS IMPORTED. `nativeImaging` below still guards the
       import, but by then it is a formality — this is the check that keeps an
       old binary from loading those modules at all. */
    if (!canChooseTeamLogo()) return { status: 'error', message: NEEDS_BUILD };

    const native = await nativeImaging();
    if (!native) return { status: 'error', message: NEEDS_BUILD };
    const { picker: ImagePicker, manipulator } = native;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { status: 'error', message: DENIED };

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      /* The system's own crop UI, which is square on iOS. `aspect` below is
         Android-only and says the same thing there. A logo drawn in a circle
         has to be cropped square by SOMEBODY, and the platform's cropper is
         better than anything we would build and already familiar. */
      allowsEditing: true,
      aspect: [1, 1],
      /* 1.0 here on purpose: this is the quality of the intermediate the
         manipulator is about to read, and compressing twice is how a 512px
         square ends up with visible artefacts. The real quality decision is
         `LOGO_QUALITY`, applied once, below. */
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.length) return { status: 'cancelled' };

    const source = picked.assets[0].uri;
    const context = manipulator.ImageManipulator.manipulate(source);
    context.resize({ width: LOGO_PX, height: LOGO_PX });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: manipulator.SaveFormat.JPEG,
      compress: LOGO_QUALITY,
      base64: true,
    });
    if (!saved.base64) return { status: 'error', message: 'Could not read that image.' };

    const upload = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(logoPath(userId), decodeBase64(saved.base64), {
        contentType: 'image/jpeg',
        /* Every upload after a manager's first lands on an object that is
           already there. Without this it is a duplicate-key failure; with it,
           it needs the UPDATE policy the migration adds alongside INSERT. */
        upsert: true,
      });
    if (upload.error) return { status: 'error', message: upload.error.message };

    const { data, error } = await supabase.rpc('set_team_logo', { p_present: true });
    if (error) return { status: 'error', message: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return {
      status: 'set',
      mark: { hasLogo: true, version: row?.logo_version ?? 1 },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}

/**
 * Take the logo down.
 *
 * THE ROW IS CLEARED BEFORE THE OBJECT IS REMOVED, which is the mirror of the
 * order upload uses and for the same reason: `has_logo` is what every reader
 * consults, so clearing it first means nobody is pointed at bytes that are on
 * their way out. Removing the object first would leave a window where the flag
 * still says yes and the file is already gone.
 *
 * A FAILED REMOVE IS NOT REPORTED. By the time it runs the logo is already
 * gone as far as the whole app is concerned; an orphaned object costs 60 KB and
 * is overwritten by the manager's next upload, and telling somebody their
 * successful action failed is the worse outcome by a distance.
 */
export async function clearTeamLogo(userId: string): Promise<LogoOutcome> {
  const { error } = await supabase.rpc('set_team_logo', { p_present: false });
  if (error) return { status: 'error', message: error.message };
  await supabase.storage.from(LOGO_BUCKET).remove([logoPath(userId)]);
  return { status: 'set', mark: NO_LOGO };
}
