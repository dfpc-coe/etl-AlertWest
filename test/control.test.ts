import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.ETL_API = process.env.ETL_API || 'http://localhost:5001';
process.env.ETL_LAYER = process.env.ETL_LAYER || '1';
process.env.ETL_TOKEN = process.env.ETL_TOKEN || 'etl.test-token';

const { default: Task } = await import('../task.js');

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/cameras.json', import.meta.url), 'utf8'));

type Device = Record<string, unknown> & { id: string; external_ids: Record<string, string> };

type Mock = {
    base: string;
    requests: Array<{ method: string; url: string }>;
    devices: Map<string, Device>;
    ephemeral: Record<string, unknown>;
    close: () => Promise<void>;
};

/** Serves the ALERTWest camera feed and enough of the CloudTAK Device & ephemeral API for the task */
async function mock(body: unknown = fixture, code = 200): Promise<Mock> {
    const state: Mock = {
        base: '',
        requests: [],
        devices: new Map(),
        ephemeral: {},
        close: async () => {}
    };

    let seq = 0;

    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        state.requests.push({ method: req.method || '', url: url.pathname });

        const json = (status: number, payload: unknown) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
        };

        const read = () => new Promise<Record<string, unknown>>((resolve) => {
            let raw = '';
            req.on('data', (chunk) => raw += chunk);
            req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
        });

        if (req.method === 'GET' && url.pathname === '/api/getCameraDataByLoc') {
            return json(code, body);
        }

        if (req.method === 'GET' && url.pathname === '/api/core/device') {
            const items = [...state.devices.values()].reverse();
            return json(200, { total: items.length, items });
        }

        if (req.method === 'POST' && url.pathname === '/api/core/device') {
            return read().then((input) => {
                const { external_id, ...rest } = input as { external_id?: { system: string; value: string } };
                const device: Device = {
                    id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
                    ...rest,
                    external_ids: external_id ? { [external_id.system]: external_id.value } : {}
                };
                state.devices.set(device.id, device);
                json(200, device);
            });
        }

        const patch = url.pathname.match(/^\/api\/core\/device\/([^/]+)$/);
        if (req.method === 'PATCH' && patch) {
            return read().then((input) => {
                const device = state.devices.get(patch[1]);
                if (!device) return json(404, { status: 404, message: 'Device Not Found' });
                Object.assign(device, input);
                json(200, device);
            });
        }

        if (req.method === 'PUT' && url.pathname === '/api/connection/1/layer/1/incoming/ephemeral') {
            return read().then((input) => {
                state.ephemeral = input;
                json(200, {});
            });
        }

        json(404, { status: 404, message: 'not found' });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    state.close = () => new Promise((resolve) => server.close(() => resolve()));

    return state;
}

async function run(api: Mock, environment: Record<string, unknown>, ephemeral: Record<string, unknown> = {}) {
    process.env.ETL_API = api.base;
    const task = await Task.init();

    const layer = {
        id: 1,
        connection: 1,
        task: 'etl-alertwest-v2.0.0',
        incoming: { environment: { BaseURL: api.base, ...environment }, ephemeral }
    };

    // @ts-expect-error partial layer for testing
    task.fetchLayer = async () => layer;
    // @ts-expect-error private in base
    task.layer = layer;

    await task.control();

    return task;
}

/** Devices by ALERTWest site id with their camera count - sorted as records are written concurrently */
function sites(api: Mock): Array<[string, unknown]> {
    return [...api.devices.values()]
        .map((device): [string, unknown] => [device.external_ids.alertwest, (device.metadata as { camera_count: number }).camera_count])
        .sort((a, b) => Number(a[0]) - Number(b[0]));
}

function site(api: Mock, external: string): Device {
    const device = [...api.devices.values()].find((d) => d.external_ids.alertwest === external);
    assert.ok(device, `no Device for site ${external}`);
    return device;
}

test('control - creates one Device per located site', async () => {
    const api = await mock();

    try {
        await run(api, {});

        assert.deepEqual(api.requests.slice(0, 3), [
            { method: 'GET', url: '/api/getCameraDataByLoc' },
            { method: 'GET', url: '/api/core/device' },
            { method: 'POST', url: '/api/core/device' }
        ]);

        // Offline & private cameras are excluded by default; co-located cameras merge
        assert.deepEqual(sites(api), [
            ['205', 2],
            ['5915', 1]
        ]);

        const device = site(api, '205');
        assert.equal(device.name, 'Mt_Lewis_Tuolumne');
        assert.equal(device.type, '10031500002202000000');
        assert.equal(device.status, 'Full');
        assert.deepEqual(device.channels, []);

        const cache = api.ephemeral.devices as Record<string, { id: string; hash: string }>;
        assert.deepEqual(Object.keys(cache).sort(), ['205', '5915']);
        assert.equal(cache['205'].id, device.id);
    } finally {
        await api.close();
    }
});

test('control - a second run with the cache touches nothing when unchanged', async () => {
    const api = await mock();

    try {
        await run(api, {});
        const ephemeral = { other: 'kept', ...api.ephemeral };

        api.requests = [];
        await run(api, {}, ephemeral);

        assert.deepEqual(api.requests, [
            { method: 'GET', url: '/api/getCameraDataByLoc' },
            { method: 'PUT', url: '/api/connection/1/layer/1/incoming/ephemeral' }
        ]);
        assert.equal(api.ephemeral.other, 'kept');
    } finally {
        await api.close();
    }
});

test('control - DeviceType & Channels are applied, an existing Device is updated', async () => {
    const api = await mock();

    try {
        await run(api, {});

        api.requests = [];
        await run(api, { DeviceType: '10031000001213000000', Channels: [2, 4] });

        assert.deepEqual(api.requests.filter((r) => r.method === 'PATCH').length, 2);
        assert.ok(!api.requests.some((r) => r.method === 'POST'));

        for (const device of api.devices.values()) {
            assert.equal(device.type, '10031000001213000000');
            assert.deepEqual(device.channels, [2, 4]);
        }
    } finally {
        await api.close();
    }
});

test('control - IncludeOffline keeps offline cameras but never private ones', async () => {
    const api = await mock();

    try {
        await run(api, { IncludeOffline: true });

        assert.deepEqual(sites(api).map(([id]) => id), ['205', '5915', '7872', '23494']);
        assert.equal(site(api, '7872').status, 'Offline');
    } finally {
        await api.close();
    }
});

test('control - States & Providers filters are case insensitive', async () => {
    const byState = await mock();
    try {
        await run(byState, { States: ['ca', ' WA '], IncludeOffline: true });
        assert.deepEqual(sites(byState).map(([id]) => id), ['205', '5915', '7872']);
    } finally {
        await byState.close();
    }

    const byProvider = await mock();
    try {
        await run(byProvider, { Providers: ['ucsd'] });
        assert.deepEqual(sites(byProvider).map(([id]) => id), ['205']);
    } finally {
        await byProvider.close();
    }
});

test('control - surfaces HTTP & API level failures', async () => {
    const http500 = await mock({ message: 'boom' }, 500);
    try {
        await assert.rejects(run(http500, {}), /ALERTWest api\/getCameraDataByLoc Failed: 500/);
    } finally {
        await http500.close();
    }

    const apiError = await mock({ code: 0, str: '', data: [], err: 'You must specify a valid camId', rendered: '' });
    try {
        await assert.rejects(run(apiError, {}), /ALERTWest api\/getCameraDataByLoc Failed: You must specify a valid camId/);
    } finally {
        await apiError.close();
    }
});
