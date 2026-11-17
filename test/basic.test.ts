import test from 'node:test';
import assert from 'node:assert';
import type { TArray, TObject } from '@sinclair/typebox';
import { SchemaType, DataFlowType } from '@tak-ps/etl';

// task.ts calls Task.init() at module scope which requires an ETL environment,
// so these must be set before the dynamic import below
process.env.ETL_API = process.env.ETL_API || 'http://localhost:5001';
process.env.ETL_LAYER = process.env.ETL_LAYER || '1';
process.env.ETL_TOKEN = process.env.ETL_TOKEN || 'etl.test-token';

const { default: Task } = await import('../task.js');

test('Task static config', () => {
    assert.equal(Task.name, 'etl-alertwest');
    assert.deepEqual(Task.flow, [DataFlowType.Incoming]);
});

test('Incoming Input schema', async () => {
    const task = await Task.init();
    const schema = await task.schema(SchemaType.Input, DataFlowType.Incoming) as TObject;

    assert.equal(schema.type, 'object');

    for (const key of ['BaseURL', 'States', 'Providers', 'IncludeOffline', 'DeviceType', 'Channels', 'DEBUG']) {
        assert.ok(key in schema.properties, `Env schema missing property: ${key}`);
        assert.notEqual(schema.properties[key].default, undefined, `Env property ${key} must have a default`);
    }

    assert.equal(schema.properties.APIKey, undefined);
    assert.equal(schema.properties.BaseURL.default, 'https://api.cdn.prod.alertwest.com');
    assert.equal(schema.properties.IncludeOffline.default, false);
    assert.equal(schema.properties.DeviceType.default, '10031500002202000000');
    assert.deepEqual(schema.properties.Channels.default, []);
    assert.equal(schema.properties.DEBUG.default, false);
});

test('Incoming Output schema', async () => {
    const task = await Task.init();
    const schemas = await task.schema(SchemaType.Output, DataFlowType.Incoming);

    assert.ok(Array.isArray(schemas));
    assert.deepEqual(schemas.map((named) => named.id), ['site']);

    const schema = schemas[0].schema as TObject;
    const cameras = schema.properties.cameras as TArray<TObject>;

    assert.equal(schema.type, 'object');
    for (const key of ['id', 'name', 'county', 'state', 'provider', 'sponsor', 'offline', 'camera_count', 'image_url', 'image_time', 'cameras']) {
        assert.ok(key in schema.properties, `Output schema missing property: ${key}`);
    }
    for (const key of ['id', 'name', 'hostname', 'provider', 'provider_link', 'ptz', 'offline', 'azimuth', 'fov', 'image_url', 'image_time']) {
        assert.ok(key in cameras.items.properties, `Camera schema missing property: ${key}`);
    }
    assert.equal(schema.properties.latitude, undefined);
    assert.equal(schema.properties.longitude, undefined);
});
