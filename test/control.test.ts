import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Static } from '@sinclair/typebox';
import type { SubmitFeatureCollection } from '@tak-ps/etl';

process.env.ETL_API = process.env.ETL_API || 'http://localhost:5001';
process.env.ETL_LAYER = process.env.ETL_LAYER || '1';
process.env.ETL_TOKEN = process.env.ETL_TOKEN || 'etl.test-token';

const { default: Task } = await import('../task.js');

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/cameras.json', import.meta.url), 'utf8'));

type Mock = {
    base: string;
    requests: Array<{ method: string; url: string }>;
    close: () => Promise<void>;
};

async function mock(body: unknown = fixture, code = 200): Promise<Mock> {
    const state: Mock = {
        base: '',
        requests: [],
        close: async () => {}
    };

    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        state.requests.push({ method: req.method || '', url: req.url || '' });

        const json = (status: number, payload: unknown) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
        };

        if (req.method === 'GET' && url.pathname === '/api/getCameraDataByLoc') {
            return json(code, body);
        }

        json(404, { message: 'not found' });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    state.close = () => new Promise((resolve) => server.close(() => resolve()));

    return state;
}

async function run(environment: Record<string, unknown>) {
    const task = await Task.init();

    const layer = {
        id: 1,
        connection: 1,
        task: 'etl-alertwest-v2.0.0',
        incoming: { environment, ephemeral: {} }
    };

    // @ts-expect-error partial layer for testing
    task.fetchLayer = async () => layer;
    // @ts-expect-error private in base
    task.layer = layer;

    let submitted: Static<typeof SubmitFeatureCollection> | null = null;
    task.submit = async (fc: Static<typeof SubmitFeatureCollection>) => {
        submitted = fc;
        return true;
    };

    await task.control();

    return { submitted: submitted as Static<typeof SubmitFeatureCollection> | null };
}

test('control - submits public online cameras under the camera schema', async () => {
    const api = await mock();

    try {
        const { submitted } = await run({ BaseURL: api.base });

        assert.deepEqual(api.requests, [
            { method: 'GET', url: '/api/getCameraDataByLoc' }
        ]);

        assert.ok(submitted);
        assert.equal(submitted.schema, 'camera');

        // Offline, private & image-less offline cameras are excluded by default
        assert.deepEqual(submitted.features.map((feat) => feat.id), [
            'alertwest-2178',
            'alertwest-9659'
        ]);
    } finally {
        await api.close();
    }
});

test('control - IncludeOffline keeps offline cameras but never private ones', async () => {
    const api = await mock();

    try {
        const { submitted } = await run({ BaseURL: `${api.base}/`, IncludeOffline: true });

        assert.ok(submitted);
        assert.deepEqual(submitted.features.map((feat) => feat.id), [
            'alertwest-2178',
            'alertwest-9659',
            'alertwest-11852',
            'alertwest-21017'
        ]);
    } finally {
        await api.close();
    }
});

test('control - States & Providers filters are case insensitive', async () => {
    const api = await mock();

    try {
        const byState = await run({ BaseURL: api.base, States: ['ca', ' WA '], IncludeOffline: true });
        assert.ok(byState.submitted);
        assert.deepEqual(byState.submitted.features.map((feat) => feat.id), [
            'alertwest-2178',
            'alertwest-9659',
            'alertwest-11852'
        ]);

        const byProvider = await run({ BaseURL: api.base, Providers: ['ucsd'] });
        assert.ok(byProvider.submitted);
        assert.deepEqual(byProvider.submitted.features.map((feat) => feat.id), ['alertwest-2178']);
    } finally {
        await api.close();
    }
});

test('control - surfaces HTTP & API level failures', async () => {
    const http500 = await mock({ message: 'boom' }, 500);
    try {
        await assert.rejects(run({ BaseURL: http500.base }), /ALERTWest api\/getCameraDataByLoc Failed: 500/);
    } finally {
        await http500.close();
    }

    const apiError = await mock({ code: 0, str: '', data: [], err: 'You must specify a valid camId', rendered: '' });
    try {
        await assert.rejects(run({ BaseURL: apiError.base }), /ALERTWest api\/getCameraDataByLoc Failed: You must specify a valid camId/);
    } finally {
        await apiError.close();
    }
});
