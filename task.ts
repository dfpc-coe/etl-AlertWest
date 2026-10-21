import type { Static, TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { Event, NamedSchema } from '@tak-ps/etl';
import ETL, { SchemaType, handler as internal, local, DataFlowType, InvocationType } from '@tak-ps/etl';
import AlertWest, { DEFAULT_URL } from './lib/alertwest.js';
import type { Camera, Location } from './lib/alertwest.js';
import { SiteSchema, SCHEMA_SITE, SYSTEM, DEVICE_TYPE, siteDevice } from './lib/site.js';
import { DeviceCache, DeviceSync } from './lib/devices.js';
import type { SyncedRecord } from './lib/devices.js';
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
    DeviceType: Type.String({
        default: DEVICE_TYPE,
        description: 'MIL-STD-2525E Symbol ID each site Device is created with - defaults to a friendly emplaced sensor'
    }),
    Channels: Type.Array(Type.Integer({ minimum: 0 }), {
        default: [],
        description: 'TAK Channel bitpos values the site Devices are shared with - empty leaves the Devices unshared'
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
                    { id: SCHEMA_SITE, schema: SiteSchema }
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

        const sites = new Map<string, { location: Static<typeof Location> | undefined, cameras: Array<Static<typeof Camera>> }>();
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

            const key = String(camera.lid);
            const site = sites.get(key) ?? { location, cameras: [] };
            site.cameras.push(camera);
            sites.set(key, site);
        }

        const records: Array<SyncedRecord> = [];
        for (const site of sites.values()) {
            const record = siteDevice(site.cameras, site.location, { type: env.DeviceType });
            if (record) records.push(record);
        }

        console.log(`ok - obtained ${records.length} sites from ${cameras.length} cameras (${skipped} filtered)`);

        const sync = new DeviceSync(this.api, await this.deviceCache(), {
            system: SYSTEM,
            channels: env.Channels
        });

        await sync.syncAll(records);

        await this.patchEphemeral({ devices: sync.cache });

        console.log(`ok - ${sync.summary()}`);
    }

    async deviceCache(): Promise<DeviceCache> {
        const layer = await this.fetchLayer();

        try {
            return this.type(DeviceCache, layer.incoming?.ephemeral.devices ?? {});
        } catch {
            return {};
        }
    }

    /**
     * The ephemeral store is replaced on every write - merge so other keys
     * are never clobbered by the Device cache
     */
    async patchEphemeral(values: Record<string, unknown>): Promise<void> {
        const layer = await this.fetchLayer();
        const ephemeral = { ...(layer.incoming?.ephemeral ?? {}), ...values };

        await this.setEphemeral(ephemeral);

        if (layer.incoming) layer.incoming.ephemeral = ephemeral;
    }
}

await local(await Task.init(import.meta.url), import.meta.url);
export async function handler(event: Event = {}) {
    return await internal(await Task.init(import.meta.url), event);
}
