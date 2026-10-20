import { IMAGE_URL } from './alertwest.js';

/** Trimmed string from a string or number value - empty & non-text values are null */
export function text(value: unknown): string | null {
    if (typeof value === 'number') return String(value);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

export function number(value: unknown): number | null {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

/** ALERTWest flags arrive as 0/1 integers, "0"/"1" strings or booleans */
export function flag(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    return number(value) === 1;
}

/**
 * Verified WGS84 point from the record or null - 0,0 and out of range values
 * are treated as unlocated rather than plotted
 */
export function coordinates(record: { lat?: unknown; lon?: unknown }): [number, number] | null {
    const lat = number(record.lat);
    const lon = number(record.lon);

    if (lat === null || lon === null) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (lat === 0 && lon === 0) return null;

    return [lon, lat];
}

/** ISO timestamp from a unix seconds value - 0 means never */
export function epoch(value: unknown): string | null {
    const seconds = number(value);
    if (seconds === null || seconds <= 0) return null;
    return new Date(seconds * 1000).toISOString();
}

const IMAGE_FILENAME = /_(\d{10})_\d+(?:_s)?\.jpg$/;

/**
 * Capture time encoded in a screenshot filename - `<name>_<unix seconds>_<n>[_s].jpg`
 */
export function imageTime(filename: unknown): Date | null {
    const name = text(filename);
    if (!name) return null;

    const match = name.match(IMAGE_FILENAME);
    if (!match) return null;

    return new Date(Number(match[1]) * 1000);
}

/**
 * Screenshots live on the image CDN under the camera id and the UTC date of
 * their capture time: /data/img/<camId>/<YYYY>/<MM>/<DD>/<filename>
 */
export function imageUrl(cameraId: unknown, filename: unknown): string | null {
    const id = text(cameraId);
    const name = text(filename);
    const time = imageTime(name);
    if (!id || !name || !time) return null;

    const yyyy = time.getUTCFullYear();
    const mm = String(time.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(time.getUTCDate()).padStart(2, '0');

    return `${IMAGE_URL}/data/img/${encodeURIComponent(id)}/${yyyy}/${mm}/${dd}/${encodeURIComponent(name)}`;
}
