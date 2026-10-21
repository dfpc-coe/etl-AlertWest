import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Value } from '@sinclair/typebox/value';
import { siteDevice, siteName, siteStatus, SiteSchema, DEVICE_TYPE } from '../lib/site.js';

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

test('siteStatus', () => {
    assert.equal(siteStatus([{ offline: false }, { offline: false }]), 'Full');
    assert.equal(siteStatus([{ offline: false }, { offline: true }]), 'Reduced');
    assert.equal(siteStatus([{ offline: true }]), 'Offline');
});

test('siteDevice - two PTZ cameras merge into one site Device', () => {
    const { cameras: cams, location } = site(205);
    assert.equal(cams.length, 2);

    const record = siteDevice(cams, location, { now });

    assert.ok(record);
    assert.equal(record.external, '205');

    const device = record.device;
    assert.equal(device.name, 'Mt_Lewis_Tuolumne');
    assert.equal(device.type, DEVICE_TYPE);
    assert.equal(device.manufacturer, 'UCSD');
    assert.equal(device.model, 'axis');
    assert.equal(device.status, 'Full');
    assert.deepEqual(device.geometry, { type: 'Point', coordinates: [-120.161903, 38.035301] });

    assert.ok(Value.Check(SiteSchema, device.metadata), JSON.stringify([...Value.Errors(SiteSchema, device.metadata)]));

    const metadata = device.metadata as Record<string, unknown>;
    assert.equal(metadata.id, '205');
    assert.equal(metadata.name, 'Mt_Lewis_Tuolumne');
    assert.equal(metadata.county, 'Tuolumne');
    assert.equal(metadata.state, 'CA');
    assert.equal(metadata.provider, 'UCSD');
    assert.equal(metadata.sponsor, 'PG&E');
    assert.equal(metadata.offline, false);
    assert.equal(metadata.camera_count, 2);
    assert.equal(metadata.image_time, '2026-10-20T03:18:21.000Z');
    assert.equal(metadata.image_url, 'https://img.cdn.prod.alertwest.com/data/img/2179/2026/10/20/Mt_Lewis_Tuolumne_2_1792466301_1413.jpg');

    const cameraMeta = metadata.cameras as Array<{ id: string; name: string; ptz: boolean; azimuth: number | null; fov: number | null }>;
    assert.deepEqual(cameraMeta.map((camera) => [camera.id, camera.name, camera.ptz, camera.azimuth, camera.fov]), [
        ['2178', 'Mt_Lewis_Tuolumne_1', true, 37.13, 62.8],
        ['2179', 'Mt_Lewis_Tuolumne_2', true, 189.36, 65.33]
    ]);

    assert.deepEqual(device.links, [{
        name: 'Mt_Lewis_Tuolumne_1',
        url: 'https://img.cdn.prod.alertwest.com/data/img/2178/2026/10/20/Mt_Lewis_Tuolumne_1_1792466294_6462.jpg'
    }, {
        name: 'Mt_Lewis_Tuolumne_2',
        url: 'https://img.cdn.prod.alertwest.com/data/img/2179/2026/10/20/Mt_Lewis_Tuolumne_2_1792466301_1413.jpg'
    }, {
        name: 'UCSD',
        url: 'https://alertcalifornia.org/'
    }]);

    assert.match(device.remarks ?? '', /Cameras: 2/);
    assert.match(device.remarks ?? '', /- Mt_Lewis_Tuolumne_1 \(37.13°\)/);
    assert.match(device.remarks ?? '', /- Mt_Lewis_Tuolumne_2 \(189.36°\)/);
});

test('siteDevice - single camera names its image link Latest Image & honours the type option', () => {
    const { cameras: cams, location } = site(205);
    const record = siteDevice([cams[0]], location, { now, type: '10031000001213000000' });

    assert.ok(record);
    assert.equal(record.device.name, 'Mt_Lewis_Tuolumne_1');
    assert.equal(record.device.type, '10031000001213000000');
    assert.equal(record.device.links?.[0].name, 'Latest Image');
});

test('siteDevice - fixed camera', () => {
    const { cameras: cams, location } = site(5915);
    const record = siteDevice(cams, location, { now });

    assert.ok(record);
    assert.equal(record.external, '5915');
    assert.equal(record.device.manufacturer, 'WSDOT');
    assert.equal(record.device.model, 'cctv');

    const metadata = record.device.metadata as { cameras: Array<{ ptz: boolean; last_moved: string | null }> };
    assert.equal(metadata.cameras[0].ptz, false);
    assert.equal(metadata.cameras[0].last_moved, null);
    assert.equal(record.device.links?.[0].url, 'https://img.cdn.prod.alertwest.com/data/img/9659/2026/10/20/I-405_at_MP_65_NE_30th_St_1792465967_4359_s.jpg');
    assert.doesNotMatch(record.device.remarks ?? '', /°/);
});

test('siteDevice - stale screenshots are not linked & offline sites are flagged', () => {
    const { cameras: cams, location } = site(7872);
    const record = siteDevice(cams, location, { now });

    assert.ok(record);
    assert.equal(record.device.status, 'Offline');

    const metadata = record.device.metadata as { offline: boolean; image_time: string | null; image_url: string | null };
    assert.equal(metadata.offline, true);
    assert.equal(metadata.image_time, '2025-05-14T20:53:25.000Z');
    assert.equal(metadata.image_url, null);
    assert.deepEqual(record.device.links?.map((link) => link.name), ['CALTRANS']);
    assert.match(record.device.remarks ?? '', /\[offline\]/);
    assert.match(record.device.remarks ?? '', /Status: Offline/);
});

test('siteDevice - no image', () => {
    const { cameras: cams, location } = site(23494);
    const record = siteDevice(cams, location, { now });

    assert.ok(record);
    const metadata = record.device.metadata as { image_time: string | null; image_url: string | null };
    assert.equal(metadata.image_time, null);
    assert.equal(metadata.image_url, null);
    assert.deepEqual(record.device.links, [{ name: 'UDOT', url: 'https://udottraffic.utah.gov/' }]);
});

test('siteDevice - unlocated, empty & missing ids', () => {
    const { cameras: cams, location } = site(205);
    assert.equal(siteDevice(cams, undefined), null);
    assert.equal(siteDevice(cams, { id: 1, lat: '0', lon: '0' }), null);
    assert.equal(siteDevice([], location), null);
    assert.equal(siteDevice([{ ...cams[0], id: ' ' }], location), null);
});
