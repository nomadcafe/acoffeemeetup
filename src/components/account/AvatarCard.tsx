import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';
import { type StatusBanner, useAccountRefresh, useAutoDismissOk } from './shared';

const AVATAR_MAX_DIMENSION = 512;

const AVATAR_WEBP_QUALITY = 0.85;

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Encode the canvas as `type`; resolves to whatever the browser produced. */
async function encodeCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: 'image/webp' | 'image/jpeg',
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return await canvas.convertToBlob({ type, quality: AVATAR_WEBP_QUALITY });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas toBlob returned null'))),
      type,
      AVATAR_WEBP_QUALITY,
    );
  });
}

/**
 * Resize + crop an image File to a square Blob (webp, or jpeg where the
 * browser can't encode webp) no larger than AVATAR_MAX_DIMENSION a side.
 * Center-crop to square so the
 * circular avatar mask doesn't slice off important content
 * unpredictably (left/right ear, etc.).
 *
 * Done client-side so the bytes that hit /api/account/avatar are
 * already tiny — saves R2 ingress + Workers CPU on resize, and means
 * a phone-sourced 8MB HEIC isn't bouncing off the 2MB server cap.
 *
 * Throws on decode failure (corrupt file, unsupported format) so the
 * caller can show a useful error rather than a silent retry.
 */
async function resizeAvatar(file: File): Promise<Blob> {
  // `imageOrientation: 'from-image'` honors the EXIF orientation tag —
  // without it, iPhone portraits decode to landscape and silently
  // upload sideways. Older browsers ignore the option (no harm).
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  const min = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - min) / 2;
  const sy = (bitmap.height - min) / 2;
  const target = Math.min(AVATAR_MAX_DIMENSION, min);

  // Prefer OffscreenCanvas (worker-friendly, doesn't pin DOM); fall
  // back to a plain <canvas> element on older Safari that lacks it.
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(target, target);
    ctx = (canvas as OffscreenCanvas).getContext('2d');
  } else {
    canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    ctx = (canvas as HTMLCanvasElement).getContext('2d');
  }
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, target, target);
  bitmap.close?.();

  // Safari (and every iOS browser) can't encode webp from a canvas and
  // silently hands back a PNG instead. Detect that and re-encode as JPEG,
  // which every browser can produce and is far smaller than PNG.
  const webp = await encodeCanvas(canvas, 'image/webp');
  if (webp.type === 'image/webp') return webp;
  return await encodeCanvas(canvas, 'image/jpeg');
}

/**
 * Avatar editor card. Shows the current image (Google OAuth-supplied
 * or user-uploaded), a file picker, and a remove button. The picker
 * resizes to ≤512px (webp / jpeg) client-side before POSTing the raw bytes —
 * server-side validation is just type/size enforcement, no
 * server-side image processing required.
 */
export function AvatarCard({ initialImage }: { initialImage: string | null }) {
  const refreshAccount = useAccountRefresh();
  const { t } = useI18n();
  const [image, setImage] = useState<string | null>(initialImage);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  // Re-sync on parent session refetch — see ProfileVisibilityCard for why.
  useEffect(() => {
    if (!busy) setImage(initialImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Abort + unmount guard: avatar uploads are slow on cellular, the
  // user can navigate away mid-flight. Without these, fetch resolves
  // on a dead component and React warns; the upload itself also can't
  // be cancelled, so we'd be uploading bytes the user no longer cares
  // about.
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function handleFile(file: File) {
    if (busy) return;
    setStatus(null);
    if (!file.type.startsWith('image/')) {
      setStatus({ kind: 'err', message: t('account.avatarBadType') });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES * 4) {
      // Pre-resize cap — even after resize a >8MB original is suspicious
      // (8K photo, RAW, etc) and not worth the CPU spike.
      setStatus({ kind: 'err', message: t('account.avatarTooLarge') });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const encoded = await resizeAvatar(file);
      if (controller.signal.aborted || !mountedRef.current) return;
      if (encoded.size > AVATAR_MAX_BYTES) {
        setStatus({ kind: 'err', message: t('account.avatarTooLarge') });
        return;
      }
      const res = await fetch('/api/account/avatar', {
        method: 'POST',
        // The format actually produced — the server checks it against the
        // bytes and rejects a mismatch.
        headers: { 'content-type': encoded.type || 'image/jpeg' },
        body: encoded,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      if (!res.ok) {
        setStatus({
          kind: 'err',
          message: t(res.status === 429 ? 'account.avatarRateLimited' : 'account.avatarUploadFailed'),
        });
        return;
      }
      const data = (await res.json()) as { image?: string };
      if (controller.signal.aborted || !mountedRef.current) return;
      if (data.image) setImage(data.image);
      setStatus({ kind: 'ok', message: t('account.avatarUploaded') });
      refreshAccount();
      track('avatar_uploaded', { sizeKB: Math.round(encoded.size / 1024), type: encoded.type });
    } catch (e) {
      if (controller.signal.aborted || !mountedRef.current) return;
      // AbortError raised on user-driven cancel is silent; everything
      // else (decode failure, network error) becomes a visible error.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setStatus({ kind: 'err', message: t('account.avatarDecodeFailed') });
    } finally {
      if (mountedRef.current) setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function handleRemove() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.avatarRemoveFailed') });
        return;
      }
      setImage(null);
      setStatus({ kind: 'ok', message: t('account.avatarRemoved') });
      refreshAccount();
      track('avatar_removed', {});
    } catch {
      setStatus({ kind: 'err', message: t('account.avatarRemoveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-avatar" className={styles.card} aria-label={t('account.avatarTitle')}>
      <h2 className={styles.cardTitle}>{t('account.avatarTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.avatarHint')}
      </p>
      <div className={styles.avatarRow}>
        {image ? (
          <img className={styles.avatarPreview} src={image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className={styles.avatarPreviewEmpty} aria-hidden>
            ☕
          </div>
        )}
        <div className={styles.avatarActions}>
          {/* Visually-hidden native file input — drives the actual upload.
              The visible button below is what the user (and screen reader)
              interacts with. iOS Safari renders the bare input as a tiny
              "Choose File" tap target obscured behind native chrome; a
              real <button> is bigger, brand-styled, and labeled. */}
          <input
            ref={fileInputRef}
            type="file"
            /* No HEIC/HEIF: only Safari can decode it here. Leaving it out
               also makes iOS hand over a JPEG from the photo library. */
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            disabled={busy}
            className={styles.avatarFileInput}
            tabIndex={-1}
            aria-hidden
          />
          <button
            type="button"
            className={styles.avatarChooseButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {image ? t('account.avatarReplace') : t('account.avatarChoose')}
          </button>
          {image ? (
            <button
              type="button"
              className={styles.linkRemove}
              onClick={() => void handleRemove()}
              disabled={busy}
              aria-label={t('account.avatarRemoveAria')}
            >
              {t('account.avatarRemove')}
            </button>
          ) : null}
        </div>
      </div>
      {status ? (
        <p
          className={status.kind === 'err' ? styles.errorMsg : styles.successMsg}
          role="status"
          style={{ marginTop: 8 }}
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
