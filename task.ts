import type { Static, TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { Event, NamedSchema, SubmitFeatureCollection, SubmitFeature } from '@tak-ps/etl';
import ETL, { SchemaType, handler as internal, local, DataFlowType, InvocationType } from '@tak-ps/etl';
import AlertWest from './lib/alertwest.js';
import { CameraSchema, SCHEMA_CAMERA, cameraFeature } from './lib/features.js';

const InputSchema = Type.Object({
    BaseURL: Type.String({
        description: 'Base URL of the ALERTWest SAPI as provided by ALERTWest alongside your API Key'
    }),
    APIKey: Type.String({
        description: 'ALERTWest SAPI Key - sent as the x-api-key header'
    }),
    DEBUG: Type.Boolean({
        default: false,
        description: 'Print raw API responses in the layer logs'
    })
});

export default class Task extends ETL {
    static name = 'etl-alertwest'
    static flow = [ DataFlowType.Incoming ];
    static invocation = [ InvocationType.Schedule ];

    async schema(
        type: SchemaType = SchemaType.Input,
        flow: DataFlowType = DataFlowType.Incoming
    ): Promise<TSchema | Array<NamedSchema>> {
        if (flow === DataFlowType.Incoming) {
            if (type === SchemaType.Input) {
                return InputSchema;
            } else {
                return [
                    { id: SCHEMA_CAMERA, schema: CameraSchema }
                ];
            }
        } else {
            return Type.Object({});
        }
    }

    async control(): Promise<void> {
        const env = await this.env(InputSchema);

        const api = new AlertWest({
            url: env.BaseURL,
            key: env.APIKey,
            debug: env.DEBUG
        });

        const cameras = await api.cameras();

        const features = new Map<string, Static<typeof SubmitFeature>>();

        for (const camera of cameras) {
            const feat = cameraFeature(camera);
            if (feat && feat.id && !features.has(feat.id)) features.set(feat.id, feat);
        }

        console.log(`ok - obtained ${features.size} located cameras from ${cameras.length} cameras`);

        const fc: Static<typeof SubmitFeatureCollection> = {
            type: 'FeatureCollection',
            schema: SCHEMA_CAMERA,
            features: Array.from(features.values())
        };

        await this.submit(fc);
    }
}

await local(await Task.init(import.meta.url), import.meta.url);
export async function handler(event: Event = {}) {
    return await internal(await Task.init(import.meta.url), event);
}
