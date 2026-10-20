import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Value } from '@sinclair/typebox/value';
import { SubmitFeature } from '@tak-ps/etl';
import { siteFeature, siteName, SiteSchema, COT_TYPE } from '../lib/features.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/cameras.json', import.meta.url), 'utf8'));
const cameras = fixture.data.cams.data;
const locations = new Map(fixture.data.locs.data.map((loc: { id: number }) => [String(loc.id), loc]));

// Shortly after the fixture screenshots were captured
const now = new Date('2026-10-20T04:00:00Z');

function site(lid: number) {
    return {
        cameras: cameras.filter((camera: { lid: number }) => camera.lid === lid),
        location: locations.get(String(lid))
    };
}

test('siteName', () => {
    assert.equal(siteName(['Mt_Lewis_Tuolumne_1', 'Mt_Lewis_Tuolumne_2']), 'Mt_Lewis_Tuolumne');
    assert.equal(siteName(['Sedgwick_Reserve_Fire_Lookout_N', 'Sedgwick_Reserve_Fixed_South']), 'Sedgwick_Reserve');
    assert.equal(siteName(['Talega_North', 'Upper_Talega_Fixed_West']), 'Talega_North');
    assert.equal(siteName(['Nichol_Knob']), 'Nichol_Knob');
    assert.equal(siteName([]), '');
});

test('siteFeature - two PTZ cameras merge into one site', () => {
    const { cameras: cams, location } = site(205);
    assert.equal(cams.length, 2);

    const feat = siteFeature(cams, location, { now });

    assert.ok(feat);
    assert.ok(Value.Check(SubmitFeature, feat), JSON.stringify([...Value.Errors(SubmitFeature, feat)]));

    assert.equal(feat.id, 'alertwest-site-205');
    assert.equal(feat.properties.callsign, 'Mt_Lewis_Tuolumne');
    assert.equal(feat.properties.type, COT_TYPE);
    assert.equal(feat.properties.time, '2026-10-20T03:18:21.000Z');
    assert.deepEqual(feat.geometry, { type: 'Point', coordinates: [-120.161903, 38.035301] });

    assert.ok(Value.Check(SiteSchema, feat.properties.metadata), JSON.stringify([...Value.Errors(SiteSchema, feat.properties.metadata)]));

    assert.equal(feat.properties.metadata.id, '205');
    assert.equal(feat.properties.metadata.name, 'Mt_Lewis_Tuolumne');
    assert.equal(feat.properties.metadata.county, 'Tuolumne');
    assert.equal(feat.properties.metadata.state, 'CA');
    assert.equal(feat.properties.metadata.provider, 'UCSD');
    assert.equal(feat.properties.metadata.sponsor, 'PG&E');
    assert.equal(feat.properties.metadata.offline, false);
    assert.equal(feat.properties.metadata.camera_count, 2);
    assert.equal(feat.properties.metadata.image_time, '2026-10-20T03:18:21.000Z');
    assert.equal(feat.properties.metadata.image_url, 'https://img.cdn.prod.alertwest.com/data/img/2179/2026/10/20/Mt_Lewis_Tuolumne_2_1792466301_1413.jpg');

    assert.deepEqual(feat.properties.metadata.cameras.map((camera) => [camera.id, camera.name, camera.ptz, camera.azimuth, camera.fov]), [
        ['2178', 'Mt_Lewis_Tuolumne_1', true, 37.13, 62.8],
        ['2179', 'Mt_Lewis_Tuolumne_2', true, 189.36, 65.33]
    ]);

    // Two PTZ cameras point different ways and a CoT holds one sensor cone
    assert.equal(feat.properties.sensor, undefined);

    assert.deepEqual(feat.properties.links, [{
        uid: 'alertwest-2178-image',
        relation: 'r-u',
        mime: 'image/jpeg',
        url: 'https://img.cdn.prod.alertwest.com/data/img/2178/2026/10/20/Mt_Lewis_Tuolumne_1_1792466294_6462.jpg',
        remarks: 'Mt_Lewis_Tuolumne_1'
    }, {
        uid: 'alertwest-2179-image',
        relation: 'r-u',
        mime: 'image/jpeg',
        url: 'https://img.cdn.prod.alertwest.com/data/img/2179/2026/10/20/Mt_Lewis_Tuolumne_2_1792466301_1413.jpg',
        remarks: 'Mt_Lewis_Tuolumne_2'
    }, {
        uid: 'alertwest-site-205-ucsd',
        relation: 'r-u',
        url: 'https://alertcalifornia.org/',
        remarks: 'UCSD'
    }]);

    assert.match(feat.properties.remarks ?? '', /Cameras: 2/);
    assert.match(feat.properties.remarks ?? '', /- Mt_Lewis_Tuolumne_1 \(37.13°\)/);
    assert.match(feat.properties.remarks ?? '', /- Mt_Lewis_Tuolumne_2 \(189.36°\)/);
});

test('siteFeature - single PTZ camera keeps its sensor bearing', () => {
    const { cameras: cams, location } = site(205);
    const feat = siteFeature([cams[0]], location, { now });

    assert.ok(feat);
    assert.equal(feat.properties.callsign, 'Mt_Lewis_Tuolumne_1');
    assert.deepEqual(feat.properties.sensor, { azimuth: 37.13, fov: 62.8, hideFov: true });
    assert.equal(feat.properties.links?.[0].remarks, 'Latest Image');
});

test('siteFeature - fixed camera has no sensor bearing', () => {
    const { cameras: cams, location } = site(5915);
    const feat = siteFeature(cams, location, { now });

    assert.ok(feat);
    assert.ok(Value.Check(SubmitFeature, feat), JSON.stringify([...Value.Errors(SubmitFeature, feat)]));

    assert.equal(feat.id, 'alertwest-site-5915');
    assert.equal(feat.properties.metadata.cameras[0].ptz, false);
    assert.equal(feat.properties.metadata.cameras[0].last_moved, null);
    assert.equal(feat.properties.sensor, undefined);
    assert.equal(feat.properties.links?.[0].url, 'https://img.cdn.prod.alertwest.com/data/img/9659/2026/10/20/I-405_at_MP_65_NE_30th_St_1792465967_4359_s.jpg');
    assert.doesNotMatch(feat.properties.remarks ?? '', /°/);
});

test('siteFeature - stale screenshots are not linked & offline sites are flagged', () => {
    const { cameras: cams, location } = site(7872);
    const feat = siteFeature(cams, location, { now });

    assert.ok(feat);
    assert.equal(feat.properties.metadata.offline, true);
    assert.equal(feat.properties.metadata.image_time, '2025-05-14T20:53:25.000Z');
    assert.equal(feat.properties.metadata.image_url, null);
    assert.equal(feat.properties.time, '2025-05-14T20:53:25.000Z');
    assert.deepEqual(feat.properties.links?.map((link) => link.uid), ['alertwest-site-7872-caltrans']);
    assert.match(feat.properties.remarks ?? '', /\[offline\]/);
    assert.match(feat.properties.remarks ?? '', /Status: Offline/);
});

test('siteFeature - no image falls back to now', () => {
    const { cameras: cams, location } = site(23494);
    const feat = siteFeature(cams, location, { now });

    assert.ok(feat);
    assert.equal(feat.properties.metadata.image_time, null);
    assert.equal(feat.properties.metadata.image_url, null);
    assert.equal(feat.properties.time, now.toISOString());
});

test('siteFeature - unlocated, empty & missing ids', () => {
    const { cameras: cams, location } = site(205);
    assert.equal(siteFeature(cams, undefined), null);
    assert.equal(siteFeature(cams, { id: 1, lat: '0', lon: '0' }), null);
    assert.equal(siteFeature([], location), null);
    assert.equal(siteFeature([{ ...cams[0], id: ' ' }], location), null);
});
