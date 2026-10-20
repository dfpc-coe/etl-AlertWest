import type { Static, TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { Event, NamedSchema, SubmitFeatureCollection, SubmitFeature } from '@tak-ps/etl';
import ETL, { SchemaType, handler as internal, local, DataFlowType, InvocationType } from '@tak-ps/etl';
import AlertWest, { DEFAULT_URL } from './lib/alertwest.js';
import { CameraSchema, SCHEMA_CAMERA, cameraFeature } from './lib/features.js';
import { text, flag } from './lib/parse.js';

const InputSchema = Type.Object({
    BaseURL: Type.String({
        default: DEFAULT_URL,
        description: 'Base URL of the public ALERTWest camera API'
    }),
    States: Type.Array(Type.String(), {
        default: [],
        description: 'Two letter state or province codes to include (ie CA, CO) - empty includes every camera'
    }),
    Providers: Type.Array(Type.String(), {
        default: [],
        description: 'Camera providers to include (ie UCSD, ALERTWest, CALTRANS, FAA) - empty includes every provider'
    }),
    IncludeOffline: Type.Boolean({
        default: false,
        description: 'Include cameras ALERTWest reports as offline'
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
            debug: env.DEBUG
        });

        const { cameras, locations } = await api.cameras();

        const states = new Set(env.States.map((state) => state.trim().toUpperCase()).filter((state) => state));
        const providers = new Set(env.Providers.map((provider) => provider.trim().toUpperCase()).filter((provider) => provider));

        const features = new Map<string, Static<typeof SubmitFeature>>();
        let skipped = 0;

        for (const camera of cameras) {
            const location = locations.get(String(camera.lid));

            if (flag(camera.pv) || (location && flag(location.lp))) {
                skipped++;
                continue;
            }

            if (!env.IncludeOffline && flag(camera.off)) {
                skipped++;
                continue;
            }

            const state = (text(camera.st) ?? text(location?.st) ?? '').toUpperCase();
            if (states.size && !states.has(state)) {
                skipped++;
                continue;
            }

            const provider = (text(camera.pr) ?? '').toUpperCase();
            if (providers.size && !providers.has(provider)) {
                skipped++;
                continue;
            }

            const feat = cameraFeature(camera, location);
            if (feat && feat.id && !features.has(feat.id)) features.set(feat.id, feat);
        }

        console.log(`ok - obtained ${features.size} cameras from ${cameras.length} (${skipped} filtered)`);

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
