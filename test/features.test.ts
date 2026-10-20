import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Value } from '@sinclair/typebox/value';
import { SubmitFeature } from '@tak-ps/etl';
import { cameraFeature, CameraSchema, COT_TYPE } from '../lib/features.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/cameras.json', import.meta.url), 'utf8'));
const cameras = fixture.data.cams.data;
const locations = new Map(fixture.data.locs.data.map((loc: { id: number }) => [String(loc.id), loc]));

// Shortly after the fixture screenshots were captured
const now = new Date('2026-10-20T04:00:00Z');

function location(camera: { lid: number }) {
    return locations.get(String(camera.lid));
}

test('cameraFeature - PTZ camera with a fresh image', () => {
    const feat = cameraFeature(cameras[0], location(cameras[0]), { now });

    assert.ok(feat);
    assert.ok(Value.Check(SubmitFeature, feat), JSON.stringify([...Value.Errors(SubmitFeature, feat)]));

    assert.equal(feat.id, 'alertwest-2178');
    assert.equal(feat.properties.callsign, 'Mt_Lewis_Tuolumne_1');
    assert.equal(feat.properties.type, COT_TYPE);
    assert.equal(feat.properties.time, '2026-10-20T03:18:14.000Z');
    assert.deepEqual(feat.geometry, { type: 'Point', coordinates: [-120.161903, 38.035301] });

    assert.ok(Value.Check(CameraSchema, feat.properties.metadata), JSON.stringify([...Value.Errors(CameraSchema, feat.properties.metadata)]));

    assert.equal(feat.properties.metadata.id, '2178');
    assert.equal(feat.properties.metadata.location_id, '205');
    assert.equal(feat.properties.metadata.hostname, 'Axis-MtLewisTuolumne');
    assert.equal(feat.properties.metadata.county, 'Tuolumne');
    assert.equal(feat.properties.metadata.state, 'CA');
    assert.equal(feat.properties.metadata.provider, 'UCSD');
    assert.equal(feat.properties.metadata.provider_link, 'https://alertcalifornia.org/');
    assert.equal(feat.properties.metadata.sponsor, 'PG&E');
    assert.equal(feat.properties.metadata.camera_class, 'axis');
    assert.equal(feat.properties.metadata.ptz, true);
    assert.equal(feat.properties.metadata.offline, false);
    assert.equal(feat.properties.metadata.azimuth, 37.13);
    assert.equal(feat.properties.metadata.elevation, -5.98);
    assert.equal(feat.properties.metadata.fov, 62.8);
    assert.equal(feat.properties.metadata.last_moved, '2026-10-20T03:05:12.000Z');
    assert.equal(feat.properties.metadata.image_time, '2026-10-20T03:18:14.000Z');
    assert.equal(feat.properties.metadata.image_url, 'https://img.cdn.prod.alertwest.com/data/img/2178/2026/10/20/Mt_Lewis_Tuolumne_1_1792466294_6462.jpg');

    assert.deepEqual(feat.properties.sensor, { azimuth: 37.13, fov: 62.8, hideFov: true });

    assert.deepEqual(feat.properties.links, [{
        uid: 'alertwest-2178-image',
        relation: 'r-u',
        mime: 'image/jpeg',
        url: 'https://img.cdn.prod.alertwest.com/data/img/2178/2026/10/20/Mt_Lewis_Tuolumne_1_1792466294_6462.jpg',
        remarks: 'Latest Image'
    }, {
        uid: 'alertwest-2178-provider',
        relation: 'r-u',
        url: 'https://alertcalifornia.org/',
        remarks: 'UCSD'
    }]);

    assert.match(feat.properties.remarks ?? '', /Provider: UCSD/);
    assert.match(feat.properties.remarks ?? '', /Hardware: axis PTZ/);
    assert.match(feat.properties.remarks ?? '', /Azimuth: 37.13/);
});

test('cameraFeature - fixed camera has no sensor bearing', () => {
    const feat = cameraFeature(cameras[1], location(cameras[1]), { now });

    assert.ok(feat);
    assert.ok(Value.Check(SubmitFeature, feat), JSON.stringify([...Value.Errors(SubmitFeature, feat)]));

    assert.equal(feat.id, 'alertwest-9659');
    assert.equal(feat.properties.metadata.ptz, false);
    assert.equal(feat.properties.metadata.last_moved, null);
    assert.equal(feat.properties.sensor, undefined);
    assert.equal(feat.properties.links?.[0].url, 'https://img.cdn.prod.alertwest.com/data/img/9659/2026/10/20/I-405_at_MP_65_NE_30th_St_1792465967_4359_s.jpg');
    assert.doesNotMatch(feat.properties.remarks ?? '', /Azimuth/);
});

test('cameraFeature - stale screenshots are not linked', () => {
    const feat = cameraFeature(cameras[2], location(cameras[2]), { now });

    assert.ok(feat);
    assert.equal(feat.properties.metadata.offline, true);
    assert.equal(feat.properties.metadata.image_time, '2025-05-14T20:53:25.000Z');
    assert.equal(feat.properties.metadata.image_url, null);
    assert.equal(feat.properties.time, '2025-05-14T20:53:25.000Z');
    assert.deepEqual(feat.properties.links?.map((link) => link.uid), ['alertwest-11852-provider']);
    assert.match(feat.properties.remarks ?? '', /Status: Offline/);
});

test('cameraFeature - no image falls back to now', () => {
    const feat = cameraFeature(cameras[3], location(cameras[3]), { now });

    assert.ok(feat);
    assert.equal(feat.properties.metadata.image_time, null);
    assert.equal(feat.properties.metadata.image_url, null);
    assert.equal(feat.properties.time, now.toISOString());
});

test('cameraFeature - unlocated & missing id', () => {
    assert.equal(cameraFeature(cameras[0], undefined), null);
    assert.equal(cameraFeature(cameras[0], { id: 1, lat: '0', lon: '0' }), null);
    assert.equal(cameraFeature({ ...cameras[0], id: ' ' }, location(cameras[0])), null);
});
