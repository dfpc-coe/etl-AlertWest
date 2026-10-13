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

/**
 * Verified WGS84 point from the record or null - 0,0 and out of range values
 * are treated as unlocated rather than plotted
 */
export function coordinates(record: { latitude?: unknown; longitude?: unknown }): [number, number] | null {
    const lat = number(record.latitude);
    const lon = number(record.longitude);

    if (lat === null || lon === null) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (lat === 0 && lon === 0) return null;

    return [lon, lat];
}

export function timestamp(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const EARTH_RADIUS_M = 6371008.8;

function radians(degrees: number): number {
    return degrees * Math.PI / 180;
}

/** Initial bearing in degrees (0-360) from one [lon, lat] to another */
export function bearing(from: [number, number], to: [number, number]): number {
    const lon1 = radians(from[0]);
    const lat1 = radians(from[1]);
    const lon2 = radians(to[0]);
    const lat2 = radians(to[1]);

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Great circle distance in meters between two [lon, lat] points */
export function distance(from: [number, number], to: [number, number]): number {
    const lat1 = radians(from[1]);
    const lat2 = radians(to[1]);
    const dlat = lat2 - lat1;
    const dlon = radians(to[0] - from[0]);

    const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;

    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * The `view.line` of a camera is a space separated list of `lat,lon` pairs
 * from the camera towards the point it is looking at
 */
export function viewLine(value: unknown): Array<[number, number]> {
    const line = text(value);
    if (!line) return [];

    const points: Array<[number, number]> = [];
    for (const pair of line.split(/\s+/)) {
        const [lat, lon] = pair.split(',');
        const point = coordinates({ latitude: lat, longitude: lon });
        if (point) points.push(point);
    }

    return points;
}
