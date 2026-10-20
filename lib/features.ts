import type { Static } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { SubmitFeature } from '@tak-ps/etl';
import type { Camera, Location } from './alertwest.js';
import { text, number, flag, coordinates, epoch, imageTime, imageUrl } from './parse.js';

export const SCHEMA_CAMERA = 'camera';

/** Camera Type - a Sensor Point in the CoT type tree */
export const COT_TYPE = 'b-m-p-s-p-loc';

/** Screenshots older than this are not linked - the CDN no longer serves them */
export const MAX_IMAGE_AGE_MS = 24 * 60 * 60 * 1000;

export const CameraSchema = Type.Object({
    id: Type.String({ description: 'ALERTWest camera identifier' }),
    name: Type.String({ description: 'Camera name as shown on ALERTWest' }),
    hostname: Type.Union([Type.Null(), Type.String()], { description: 'Camera hostname' }),
    location_id: Type.String({ description: 'ALERTWest location identifier - shared by co-located cameras' }),
    county: Type.Union([Type.Null(), Type.String()], { description: 'County the camera is in' }),
    state: Type.Union([Type.Null(), Type.String()], { description: 'Two letter state or province the camera is in' }),
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

export type FeatureOptions = {
    now?: Date;
};

/**
 * Map a camera and its location to a Feature - returns null for cameras
 * without a verified location
 */
export function cameraFeature(
    camera: Static<typeof Camera>,
    location: Static<typeof Location> | undefined,
    opts: FeatureOptions = {}
): Static<typeof SubmitFeature> | null {
    const id = text(camera.id);
    if (!id) return null;

    const position = location ? coordinates(location) : null;
    if (!position) {
        console.log(`ok - skipping unlocated camera ${id}`);
        return null;
    }

    const now = opts.now ?? new Date();
    const captured = imageTime(camera.img);
    const fresh = captured !== null && now.getTime() - captured.getTime() <= MAX_IMAGE_AGE_MS;
    const name = text(camera.cn) ?? text(camera.hn) ?? id;

    const metadata: Static<typeof CameraSchema> = {
        id,
        name,
        hostname: text(camera.hn),
        location_id: String(camera.lid),
        county: text(camera.co),
        state: text(camera.st) ?? text(location?.st),
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

    const time = metadata.image_time ?? metadata.last_moved ?? now.toISOString();

    const feature: Static<typeof SubmitFeature> = {
        id: `alertwest-${id}`,
        type: 'Feature',
        properties: {
            callsign: name,
            type: COT_TYPE,
            how: 'm-g',
            time,
            start: time,
            remarks: remarks([
                `Camera: ${name}`,
                metadata.provider ? `Provider: ${metadata.provider}` : null,
                metadata.sponsor ? `Sponsor: ${metadata.sponsor}` : null,
                metadata.county || metadata.state ? `Location: ${[metadata.county, metadata.state].filter((part) => part).join(', ')}` : null,
                metadata.camera_class ? `Hardware: ${metadata.camera_class}${metadata.ptz ? ' PTZ' : ''}` : null,
                metadata.azimuth !== null && metadata.ptz ? `Azimuth: ${metadata.azimuth}°` : null,
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

    // Fixed cameras report an azimuth of 0 regardless of where they point
    if (metadata.ptz && metadata.azimuth !== null) {
        feature.properties.sensor = {
            azimuth: metadata.azimuth,
            ...(metadata.fov ? { fov: metadata.fov } : {}),
            hideFov: true
        };
    }

    const links: NonNullable<Static<typeof SubmitFeature>['properties']['links']> = [];

    if (metadata.image_url) {
        links.push({
            uid: `${feature.id}-image`,
            relation: 'r-u',
            mime: 'image/jpeg',
            url: metadata.image_url,
            remarks: 'Latest Image'
        });
    }

    if (metadata.provider_link) {
        links.push({
            uid: `${feature.id}-provider`,
            relation: 'r-u',
            url: metadata.provider_link,
            remarks: metadata.provider ?? 'Provider'
        });
    }

    if (links.length) feature.properties.links = links;

    return feature;
}

function remarks(lines: Array<string | null>): string {
    return lines.filter((line) => line !== null).join('\n');
}
