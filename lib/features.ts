import type { Static } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { SubmitFeature } from '@tak-ps/etl';
import type { Camera } from './alertwest.js';
import { text, number, coordinates, timestamp, bearing, distance, viewLine } from './parse.js';

export const SCHEMA_CAMERA = 'camera';

/** Camera Type - a Sensor Point in the CoT type tree */
export const COT_TYPE = 'b-m-p-s-p-loc';

export const CameraSchema = Type.Object({
    name: Type.String({ description: 'Camera name as shown on ALERTWest' }),
    source: Type.String({ description: 'ALERTWest camera source identifier - unique per camera' }),
    site_id: Type.Union([Type.Null(), Type.String()], { description: 'ALERTWest site identifier the camera is installed at' }),
    description: Type.Union([Type.Null(), Type.String()], { description: 'Site description' }),
    county: Type.Union([Type.Null(), Type.String()], { description: 'County the site is in' }),
    state: Type.Union([Type.Null(), Type.String()], { description: 'Two letter state the site is in' }),
    altitude: Type.Union([Type.Null(), Type.Number()], { description: 'Site altitude in meters' }),
    site_time: Type.Union([Type.Null(), Type.String({ format: 'date-time' })], { description: 'Time the site record was last updated' }),
    image_url: Type.Union([Type.Null(), Type.String()], { description: 'URL of the latest image from the camera' }),
    image_time: Type.Union([Type.Null(), Type.String({ format: 'date-time' })], { description: 'Time the latest image was captured' }),
    pan: Type.Union([Type.Null(), Type.Number()], { description: 'Pan of the camera in degrees' }),
    tilt: Type.Union([Type.Null(), Type.Number()], { description: 'Tilt of the camera in degrees' }),
    zoom: Type.Union([Type.Null(), Type.Number()], { description: 'Zoom of the camera' }),
    position_time: Type.Union([Type.Null(), Type.String({ format: 'date-time' })], { description: 'Time the camera position was last reported' }),
    manufacturer: Type.Union([Type.Null(), Type.String()], { description: 'Camera manufacturer - ie Axis' }),
    model: Type.Union([Type.Null(), Type.String()], { description: 'Camera model number - ie Q6075-E' }),
    serial: Type.Union([Type.Null(), Type.String()], { description: 'Camera serial number' }),
    view_line: Type.Union([Type.Null(), Type.String()], { description: 'Space separated lat,lon pairs from the camera towards the point it is looking at' }),
    azimuth: Type.Union([Type.Null(), Type.Number()], { description: 'Bearing in degrees from the camera to the end of the view line' }),
    range: Type.Union([Type.Null(), Type.Number()], { description: 'Distance in meters from the camera to the end of the view line' })
});

export type FeatureOptions = {
    now?: Date;
};

/**
 * Map a single camera to a Feature - returns null for cameras without a
 * verified site location
 */
export function cameraFeature(
    camera: Static<typeof Camera>,
    opts: FeatureOptions = {}
): Static<typeof SubmitFeature> | null {
    const source = text(camera.source);
    if (!source) return null;

    const site = camera.site ?? {};
    const position = camera.position ?? {};
    const image = camera.image ?? {};
    const parameters = camera.parameters ?? {};

    const location = coordinates(site);
    if (!location) {
        console.log(`ok - skipping unlocated camera ${source}`);
        return null;
    }

    const line = viewLine(camera.view?.line);
    const target = line.length > 1 ? line[line.length - 1] : null;

    const altitude = number(site.altitude);
    const name = text(camera.name) ?? source;

    const metadata: Static<typeof CameraSchema> = {
        name,
        source,
        site_id: text(site.id),
        description: text(site.description),
        county: text(site.county),
        state: text(site.state),
        altitude,
        site_time: timestamp(site.time),
        image_url: text(image.url),
        image_time: timestamp(image.time),
        pan: number(position.pan),
        tilt: number(position.tilt),
        zoom: number(position.zoom),
        position_time: timestamp(position.time),
        manufacturer: text(parameters['Brand.Brand']),
        model: text(parameters['Brand.ProdNbr']),
        serial: text(parameters['Properties.System.SerialNumber']),
        view_line: text(camera.view?.line),
        azimuth: target ? Math.round(bearing(location, target) * 100) / 100 : null,
        range: target ? Math.round(distance(location, target)) : null
    };

    const now = opts.now ?? new Date();
    const time = metadata.image_time ?? metadata.position_time ?? metadata.site_time ?? now.toISOString();

    const feature: Static<typeof SubmitFeature> = {
        id: `alertwest-${source}`,
        type: 'Feature',
        properties: {
            callsign: name,
            type: COT_TYPE,
            how: 'm-g',
            time,
            start: time,
            remarks: remarks([
                `Camera: ${name}`,
                `Source: ${source}`,
                metadata.site_id ? `Site: ${metadata.site_id}${metadata.description ? ` - ${metadata.description}` : ''}` : null,
                metadata.county || metadata.state ? `Location: ${[metadata.county, metadata.state].filter((part) => part).join(', ')}` : null,
                metadata.manufacturer || metadata.model ? `Hardware: ${[metadata.manufacturer, metadata.model].filter((part) => part).join(' ')}` : null,
                metadata.serial ? `Serial: ${metadata.serial}` : null,
                metadata.azimuth !== null ? `Azimuth: ${metadata.azimuth}°` : null,
                metadata.image_time ? `Last Image: ${metadata.image_time}` : null
            ]),
            metadata
        },
        geometry: {
            type: 'Point',
            coordinates: altitude !== null ? [location[0], location[1], altitude] : location
        }
    };

    if (metadata.azimuth !== null) {
        feature.properties.sensor = {
            azimuth: metadata.azimuth,
            ...(metadata.range ? { range: metadata.range } : {}),
            ...(altitude !== null ? { elevation: altitude } : {}),
            hideFov: true
        };
    }

    if (metadata.image_url) {
        feature.properties.links = [{
            uid: `${feature.id}-image`,
            relation: 'r-u',
            mime: 'image/jpeg',
            url: metadata.image_url,
            remarks: 'Latest Image'
        }];
    }

    return feature;
}

function remarks(lines: Array<string | null>): string {
    return lines.filter((line) => line !== null).join('\n');
}
