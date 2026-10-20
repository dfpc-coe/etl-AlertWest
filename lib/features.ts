import type { Static } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { SubmitFeature } from '@tak-ps/etl';
import type { Camera, Location } from './alertwest.js';
import { text, number, flag, coordinates, epoch, imageTime, imageUrl } from './parse.js';

export const SCHEMA_SITE = 'site';

/** Site Type - a Sensor Point in the CoT type tree */
export const COT_TYPE = 'b-m-p-s-p-loc';

/** Screenshots older than this are not linked - the CDN no longer serves them */
export const MAX_IMAGE_AGE_MS = 24 * 60 * 60 * 1000;

export const CameraSchema = Type.Object({
    id: Type.String({ description: 'ALERTWest camera identifier' }),
    name: Type.String({ description: 'Camera name as shown on ALERTWest' }),
    hostname: Type.Union([Type.Null(), Type.String()], { description: 'Camera hostname' }),
    provider: Type.Union([Type.Null(), Type.String()], { description: 'Organization providing the camera - ie UCSD, CALTRANS, FAA' }),
    provider_link: Type.Union([Type.Null(), Type.String()], { description: 'Website of the providing organization' }),
    sponsor: Type.Union([Type.Null(), Type.String()], { description: 'Camera sponsor - ie PG&E' }),
    isp: Type.Union([Type.Null(), Type.String()], { description: 'Network the camera is connected through' }),
    camera_class: Type.Union([Type.Null(), Type.String()], { description: 'Camera class - axis, cctv or flir' }),
    camera_type: Type.Union([Type.Null(), Type.String()], { description: 'ALERTWest camera type code' }),
    ptz: Type.Boolean({ description: 'Whether the camera can pan, tilt & zoom' }),
    offline: Type.Boolean({ description: 'Whether ALERTWest reports the camera as offline' }),
    azimuth: Type.Union([Type.Null(), Type.Number()], { description: 'Direction the camera is pointing in degrees' }),
    elevation: Type.Union([Type.Null(), Type.Number()], { description: 'Tilt of the camera in degrees' }),
    zoom: Type.Union([Type.Null(), Type.Number()], { description: 'Zoom of the camera' }),
    fov: Type.Union([Type.Null(), Type.Number()], { description: 'Horizontal field of view in degrees' }),
    last_moved: Type.Union([Type.Null(), Type.String({ format: 'date-time' })], { description: 'Time the camera was last moved' }),
    latency: Type.Union([Type.Null(), Type.Number()], { description: 'Reported camera latency' }),
    image_url: Type.Union([Type.Null(), Type.String()], { description: 'URL of the latest image from the camera' }),
    image_time: Type.Union([Type.Null(), Type.String({ format: 'date-time' })], { description: 'Time the latest image was captured' })
});

/** A camera site - every camera ALERTWest installs at one location */
export const SiteSchema = Type.Object({
    id: Type.String({ description: 'ALERTWest location identifier' }),
    name: Type.String({ description: 'Site name - the portion of the camera names shared by every camera at the site' }),
    county: Type.Union([Type.Null(), Type.String()], { description: 'County the site is in' }),
    state: Type.Union([Type.Null(), Type.String()], { description: 'Two letter state or province the site is in' }),
    provider: Type.Union([Type.Null(), Type.String()], { description: 'Organizations providing cameras at the site - comma separated when mixed' }),
    sponsor: Type.Union([Type.Null(), Type.String()], { description: 'Camera sponsors at the site - comma separated when mixed' }),
    offline: Type.Boolean({ description: 'Whether every camera at the site is offline' }),
    camera_count: Type.Integer({ description: 'Number of cameras at the site' }),
    image_url: Type.Union([Type.Null(), Type.String()], { description: 'URL of the most recent image from any camera at the site' }),
    image_time: Type.Union([Type.Null(), Type.String({ format: 'date-time' })], { description: 'Time the most recent image was captured' }),
    cameras: Type.Array(CameraSchema, { description: 'Cameras at the site' })
});

export type FeatureOptions = {
    now?: Date;
};

export function cameraMetadata(camera: Static<typeof Camera>, now: Date): Static<typeof CameraSchema> | null {
    const id = text(camera.id);
    if (!id) return null;

    const captured = imageTime(camera.img);
    const fresh = captured !== null && now.getTime() - captured.getTime() <= MAX_IMAGE_AGE_MS;

    return {
        id,
        name: text(camera.cn) ?? text(camera.hn) ?? id,
        hostname: text(camera.hn),
        provider: text(camera.pr),
        provider_link: text(camera.pl),
        sponsor: text(camera.sp),
        isp: text(camera.isp),
        camera_class: text(camera.cc),
        camera_type: text(camera.typ),
        ptz: flag(camera.ptz),
        offline: flag(camera.off),
        azimuth: number(camera.p),
        elevation: number(camera.t),
        zoom: number(camera.z),
        fov: number(camera.fov),
        last_moved: epoch(camera.lmt),
        latency: number(camera.cl),
        image_url: fresh ? imageUrl(id, camera.img) : null,
        image_time: captured ? captured.toISOString() : null
    };
}

/**
 * The portion of the camera names shared by every camera at a site - the
 * `_` separated tokens they have in common, ie `Mt_Lewis_1` & `Mt_Lewis_2`
 * give `Mt_Lewis`. Falls back to the first camera name
 */
export function siteName(names: Array<string>): string {
    if (!names.length) return '';
    if (names.length === 1) return names[0];

    const tokens = names.map((name) => name.split('_'));
    const shared: Array<string> = [];

    for (let i = 0; i < Math.min(...tokens.map((t) => t.length)); i++) {
        if (tokens.every((t) => t[i] === tokens[0][i])) shared.push(tokens[0][i]);
        else break;
    }

    return shared.join('_') || names[0];
}

function unique(values: Array<string | null>): string | null {
    const set = new Set(values.filter((value): value is string => value !== null));
    return set.size ? Array.from(set).join(', ') : null;
}

function latest(values: Array<string | null>): string | null {
    return values.reduce<string | null>((max, value) => {
        if (value === null) return max;
        return max === null || value > max ? value : max;
    }, null);
}

/**
 * Map the cameras at a location to a single Feature - returns null for
 * locations without a verified position or without any cameras
 */
export function siteFeature(
    cameras: Array<Static<typeof Camera>>,
    location: Static<typeof Location> | undefined,
    opts: FeatureOptions = {}
): Static<typeof SubmitFeature> | null {
    const now = opts.now ?? new Date();

    const position = location ? coordinates(location) : null;
    if (!position || !location) {
        console.log(`ok - skipping unlocated cameras ${cameras.map((camera) => camera.id).join(', ')}`);
        return null;
    }

    const cams = cameras
        .map((camera) => cameraMetadata(camera, now))
        .filter((camera): camera is Static<typeof CameraSchema> => camera !== null);
    if (!cams.length) return null;

    const freshest = cams
        .filter((camera) => camera.image_url && camera.image_time)
        .sort((a, b) => (a.image_time! < b.image_time! ? 1 : -1))[0];

    const metadata: Static<typeof SiteSchema> = {
        id: String(location.id),
        name: siteName(cams.map((camera) => camera.name)),
        county: unique(cams.map((camera) => text(cameras.find((raw) => text(raw.id) === camera.id)?.co) ?? null)),
        state: unique(cams.map((camera) => text(cameras.find((raw) => text(raw.id) === camera.id)?.st) ?? null)) ?? text(location.st),
        provider: unique(cams.map((camera) => camera.provider)),
        sponsor: unique(cams.map((camera) => camera.sponsor)),
        offline: cams.every((camera) => camera.offline),
        camera_count: cams.length,
        image_url: freshest?.image_url ?? null,
        image_time: latest(cams.map((camera) => camera.image_time)),
        cameras: cams
    };

    const time = metadata.image_time ?? latest(cams.map((camera) => camera.last_moved)) ?? now.toISOString();

    const feature: Static<typeof SubmitFeature> = {
        id: `alertwest-site-${metadata.id}`,
        type: 'Feature',
        properties: {
            callsign: metadata.name,
            type: COT_TYPE,
            how: 'm-g',
            time,
            start: time,
            remarks: remarks([
                `Site: ${metadata.name}`,
                metadata.provider ? `Provider: ${metadata.provider}` : null,
                metadata.sponsor ? `Sponsor: ${metadata.sponsor}` : null,
                metadata.county || metadata.state ? `Location: ${[metadata.county, metadata.state].filter((part) => part).join(', ')}` : null,
                `Cameras: ${cams.length}`,
                ...cams.map((camera) => `- ${camera.name}${camera.ptz && camera.azimuth !== null ? ` (${camera.azimuth}°)` : ''}${camera.offline ? ' [offline]' : ''}`),
                metadata.image_time ? `Last Image: ${metadata.image_time}` : null,
                metadata.offline ? 'Status: Offline' : null
            ]),
            metadata
        },
        geometry: {
            type: 'Point',
            coordinates: position
        }
    };

    // A CoT carries a single sensor cone, so the bearing is only meaningful
    // when one PTZ camera is at the site - fixed cameras report an azimuth of 0
    const ptz = cams.filter((camera) => camera.ptz && camera.azimuth !== null);
    if (ptz.length === 1) {
        feature.properties.sensor = {
            azimuth: ptz[0].azimuth!,
            ...(ptz[0].fov ? { fov: ptz[0].fov } : {}),
            hideFov: true
        };
    }

    const links: NonNullable<Static<typeof SubmitFeature>['properties']['links']> = [];

    for (const camera of cams) {
        if (!camera.image_url) continue;

        links.push({
            uid: `alertwest-${camera.id}-image`,
            relation: 'r-u',
            mime: 'image/jpeg',
            url: camera.image_url,
            remarks: cams.length > 1 ? camera.name : 'Latest Image'
        });
    }

    const providers = new Map<string, string>();
    for (const camera of cams) {
        if (camera.provider_link && !providers.has(camera.provider_link)) {
            providers.set(camera.provider_link, camera.provider ?? 'Provider');
        }
    }

    for (const [url, provider] of providers) {
        links.push({
            uid: `${feature.id}-${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            relation: 'r-u',
            url,
            remarks: provider
        });
    }

    if (links.length) feature.properties.links = links;

    return feature;
}

function remarks(lines: Array<string | null>): string {
    return lines.filter((line) => line !== null).join('\n');
}
