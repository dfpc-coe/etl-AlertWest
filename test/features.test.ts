import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Value } from '@sinclair/typebox/value';
import { SubmitFeature } from '@tak-ps/etl';
import { cameraFeature, CameraSchema, COT_TYPE } from '../lib/features.js';

const cameras = JSON.parse(fs.readFileSync(new URL('./fixtures/cameras.json', import.meta.url), 'utf8'));

test('cameraFeature - full record', () => {
    const feat = cameraFeature(cameras[0], { now: new Date('2026-01-01T00:00:00Z') });

    assert.ok(feat);
    assert.ok(Value.Check(SubmitFeature, feat), JSON.stringify([...Value.Errors(SubmitFeature, feat)]));

    assert.equal(feat.id, 'alertwest-Mt_Aukum_1');
    assert.equal(feat.properties.callsign, 'Axis-MtAukum1');
    assert.equal(feat.properties.type, COT_TYPE);
    assert.equal(feat.properties.time, '2025-12-10T20:35:56.000Z');
    assert.deepEqual(feat.geometry, { type: 'Point', coordinates: [-120.726982, 38.573868] });

    assert.ok(Value.Check(CameraSchema, feat.properties.metadata), JSON.stringify([...Value.Errors(CameraSchema, feat.properties.metadata)]));

    assert.equal(feat.properties.metadata.site_id, '2148');
    assert.equal(feat.properties.metadata.county, 'eldorado');
    assert.equal(feat.properties.metadata.state, 'CA');
    assert.equal(feat.properties.metadata.manufacturer, 'Axis');
    assert.equal(feat.properties.metadata.model, 'Q6075-E');
    assert.equal(feat.properties.metadata.serial, null);
    assert.equal(feat.properties.metadata.pan, 248);
    assert.equal(feat.properties.metadata.tilt, -1.8);
    assert.equal(feat.properties.metadata.zoom, 3000);
    assert.equal(feat.properties.metadata.azimuth, 247.92);
    assert.equal(feat.properties.metadata.range, 1606);

    assert.ok(feat.properties.sensor);
    assert.equal(feat.properties.sensor.azimuth, 247.92);
    assert.equal(feat.properties.sensor.range, 1606);
    assert.equal(feat.properties.sensor.hideFov, true);

    assert.ok(feat.properties.links);
    assert.equal(feat.properties.links.length, 1);
    assert.equal(feat.properties.links[0].url, cameras[0].image.url);

    assert.match(feat.properties.remarks ?? '', /Hardware: Axis Q6075-E/);
    assert.match(feat.properties.remarks ?? '', /Azimuth: 247.92/);
});

test('cameraFeature - sparse record', () => {
    const feat = cameraFeature(cameras[1], { now: new Date('2026-01-01T00:00:00Z') });

    assert.ok(feat);
    assert.ok(Value.Check(SubmitFeature, feat), JSON.stringify([...Value.Errors(SubmitFeature, feat)]));

    assert.equal(feat.id, 'alertwest-Ridge_Tahoe_NV');
    assert.equal(feat.properties.time, '2025-04-01T18:06:41.000Z');
    assert.deepEqual(feat.geometry, { type: 'Point', coordinates: [-119.9024, 38.9638, 2290.5] });

    assert.equal(feat.properties.metadata.serial, 'ACCC8E123456');
    assert.equal(feat.properties.metadata.manufacturer, null);
    assert.equal(feat.properties.metadata.image_url, null);
    assert.equal(feat.properties.metadata.azimuth, null);
    assert.equal(feat.properties.metadata.range, null);

    assert.equal(feat.properties.sensor, undefined);
    assert.equal(feat.properties.links, undefined);

    assert.match(feat.properties.remarks ?? '', /Site: 12224 - Ridge Tahoe Resort/);
    assert.match(feat.properties.remarks ?? '', /Location: douglas, NV/);
});

test('cameraFeature - unlocated & empty source', () => {
    assert.equal(cameraFeature(cameras[2]), null);
    assert.equal(cameraFeature({ ...cameras[0], source: ' ' }), null);
});

test('cameraFeature - falls back to now without any timestamps', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const feat = cameraFeature({ name: 'Bare', source: 'bare', site: { latitude: 1, longitude: 2 } }, { now });

    assert.ok(feat);
    assert.equal(feat.properties.time, now.toISOString());
    assert.equal(feat.properties.callsign, 'Bare');
});
