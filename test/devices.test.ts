import test from 'node:test';
import assert from 'node:assert';
import type { CoreDevice, CoreDeviceCreate, CoreDeviceUpdate, CoreDeviceListQuery } from '@tak-ps/etl';
import { DeviceSync } from '../lib/devices.js';
import type { DeviceAPI, DeviceCache, SyncedRecord } from '../lib/devices.js';

const SYSTEM = 'test';

class NotFound extends Error {
    status = 404;
}

/** In-memory stand in for the CloudTAK Device API */
class FakeAPI implements DeviceAPI {
    devices = new Map<string, CoreDevice>();
    log: string[] = [];
    seq = 0;

    Device = {
        list: async (query: Partial<CoreDeviceListQuery> = {}) => {
            this.log.push(`list ${query.page ?? 0}`);
            const items = [...this.devices.values()].reverse();
            const limit = query.limit ?? 10;
            const page = query.page ?? 0;
            return { total: items.length, items: items.slice(page * limit, (page + 1) * limit) };
        },
        create: async (body: CoreDeviceCreate) => {
            this.log.push('create');
            const { external_id, ...rest } = body;
            const external = external_id && typeof external_id === 'object' ? { [external_id.system]: external_id.value } : {};
            const device = { id: `device-${++this.seq}`, ...rest, external_ids: external } as unknown as CoreDevice;
            this.devices.set(device.id, device);
            return device;
        },
        update: async (id: string, body: CoreDeviceUpdate) => {
            this.log.push(`update ${id} ${Object.keys(body).join(',')}`);
            const device = this.devices.get(id);
            if (!device) throw new NotFound('Not Found');
            Object.assign(device, body);
            return device;
        }
    };

    byExternal(value: string): CoreDevice {
        const device = [...this.devices.values()].find((d) => d.external_ids[SYSTEM] === value);
        assert.ok(device, `no device filed under ${value}`);
        return device;
    }
}

function record(external: string, overrides: Partial<SyncedRecord['device']> = {}): SyncedRecord {
    return {
        external,
        device: {
            name: `Site ${external}`,
            type: '10031500002202000000',
            geometry: { type: 'Point', coordinates: [-105, 39] },
            manufacturer: 'UCSD',
            model: 'axis',
            status: 'Full',
            remarks: '',
            metadata: { id: external },
            links: [],
            ...overrides
        }
    };
}

test('DeviceSync - creates, updates, and skips unchanged records', async () => {
    const api = new FakeAPI();
    const cache: DeviceCache = {};

    const first = new DeviceSync(api, cache, { system: SYSTEM });
    await first.sync(record('1'));
    await first.sync(record('2'));
    await first.sync(record('2'));

    assert.deepEqual(api.log, ['list 0', 'create', 'create']);
    assert.deepEqual(first.counts, { created: 2, updated: 0, unchanged: 0, failed: 0 });
    assert.equal(api.byExternal('1').name, 'Site 1');
    assert.deepEqual(api.byExternal('1').external_ids, { test: '1' });
    assert.deepEqual(Object.keys(cache).sort(), ['1', '2']);

    api.log = [];
    const second = new DeviceSync(api, cache, { system: SYSTEM });
    await second.sync(record('1'));
    await second.sync(record('2', { status: 'Offline' }));

    assert.deepEqual(api.log, ['update device-2 name,type,geometry,manufacturer,model,status,remarks,metadata,links']);
    assert.deepEqual(second.counts, { created: 0, updated: 1, unchanged: 1, failed: 0 });
    assert.equal(api.byExternal('2').status, 'Offline');
    assert.equal(second.summary(), '2 records: 0 created, 1 updated, 1 unchanged, 0 failed');
});

test('DeviceSync - channels are written and part of the change digest', async () => {
    const api = new FakeAPI();
    const cache: DeviceCache = {};

    await new DeviceSync(api, cache, { system: SYSTEM, channels: [3] }).sync(record('1'));
    assert.deepEqual(api.byExternal('1').channels, [3]);

    api.log = [];
    const sync = new DeviceSync(api, cache, { system: SYSTEM, channels: [3, 5] });
    await sync.sync(record('1'));
    assert.deepEqual(api.log, ['update device-1 name,type,geometry,manufacturer,model,status,remarks,metadata,links,channels']);

    api.log = [];
    await new DeviceSync(api, cache, { system: SYSTEM }).sync(record('1'));
    assert.deepEqual(api.log, ['update device-1 name,type,geometry,manufacturer,model,status,remarks,metadata,links']);
});

test('DeviceSync - an empty cache is rebuilt from the Device index', async () => {
    const api = new FakeAPI();
    await new DeviceSync(api, {}, { system: SYSTEM }).sync(record('1'));

    api.log = [];
    const cache: DeviceCache = {};
    const sync = new DeviceSync(api, cache, { system: SYSTEM });
    await sync.sync(record('1'));
    await sync.sync(record('2'));

    assert.deepEqual(api.log, ['list 0', 'update device-1 name,type,geometry,manufacturer,model,status,remarks,metadata,links', 'create']);
    assert.equal(api.devices.size, 2);
    assert.equal(cache['1'].id, 'device-1');
});

test('DeviceSync - a deleted Device is recreated', async () => {
    const api = new FakeAPI();
    const cache: DeviceCache = {};
    await new DeviceSync(api, cache, { system: SYSTEM }).sync(record('1'));

    api.devices.clear();
    api.log = [];

    const sync = new DeviceSync(api, cache, { system: SYSTEM });
    await sync.sync(record('1', { status: 'Reduced' }));

    assert.deepEqual(api.log, ['update device-1 name,type,geometry,manufacturer,model,status,remarks,metadata,links', 'create']);
    assert.equal(cache['1'].id, 'device-2');
    assert.deepEqual(sync.counts, { created: 1, updated: 0, unchanged: 0, failed: 0 });
});

test('DeviceSync - a failed record is counted and the rest are written', async () => {
    const api = new FakeAPI();
    api.Device.create = async () => { throw new Error('boom'); };

    const sync = new DeviceSync(api, {}, { system: SYSTEM });
    await sync.syncAll([record('1'), record('2')]);

    assert.deepEqual(sync.counts, { created: 0, updated: 0, unchanged: 0, failed: 2 });
});

test('DeviceSync - syncAll bounds the records in flight', async () => {
    const api = new FakeAPI();
    let inflight = 0;
    let peak = 0;

    api.Device.create = async (body: CoreDeviceCreate) => {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inflight--;
        const device = { id: `device-${++api.seq}`, ...body, external_ids: {} } as unknown as CoreDevice;
        api.devices.set(device.id, device);
        return device;
    };

    const sync = new DeviceSync(api, {}, { system: SYSTEM });
    await sync.syncAll(Array.from({ length: 10 }, (_, i) => record(String(i))), 3);

    assert.equal(sync.counts.created, 10);
    assert.equal(peak, 3);
});

test('DeviceSync.clampName', () => {
    assert.equal(DeviceSync.clampName('short'), 'short');
    assert.equal(DeviceSync.clampName('x'.repeat(70)).length, 64);
});
