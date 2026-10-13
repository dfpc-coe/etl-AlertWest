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

const cameras = JSON.parse(fs.readFileSync(new URL('./fixtures/cameras.json', import.meta.url), 'utf8'));

type Mock = {
    base: string;
    requests: Array<{ method: string; url: string; key: string | undefined }>;
    close: () => Promise<void>;
};

async function mock(): Promise<Mock> {
    const state: Mock = {
        base: '',
        requests: [],
        close: async () => {}
    };

    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const key = req.headers['x-api-key'];
        state.requests.push({ method: req.method || '', url: req.url || '', key: Array.isArray(key) ? key[0] : key });

        const json = (code: number, body: unknown) => {
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        };

        if (key !== 'secret') return json(403, { message: 'Forbidden' });

        if (req.method === 'GET' && url.pathname === '/sapi/api/firecams/v0/cameras') {
            return json(200, [...cameras, cameras[0]]);
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
        task: 'etl-alertwest-v1.0.0',
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

test('control - submits located cameras under the camera schema', async () => {
    const api = await mock();

    try {
        const { submitted } = await run({
            BaseURL: `${api.base}/sapi`,
            APIKey: 'secret',
            DEBUG: false
        });

        assert.deepEqual(api.requests, [
            { method: 'GET', url: '/sapi/api/firecams/v0/cameras', key: 'secret' }
        ]);

        assert.ok(submitted);
        assert.equal(submitted.schema, 'camera');
        assert.deepEqual(submitted.features.map((feat) => feat.id), [
            'alertwest-Mt_Aukum_1',
            'alertwest-Ridge_Tahoe_NV'
        ]);
    } finally {
        await api.close();
    }
});

test('control - surfaces a rejected API key', async () => {
    const api = await mock();

    try {
        await assert.rejects(run({
            BaseURL: `${api.base}/sapi/`,
            APIKey: 'wrong',
            DEBUG: false
        }), /ALERTWest api\/firecams\/v0\/cameras Failed: 403/);
    } finally {
        await api.close();
    }
});
