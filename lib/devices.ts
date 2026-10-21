import { createHash } from 'node:crypto';
import type { Static } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { CloudTAKAPI, CoreDevice, CoreDeviceCreate } from '@tak-ps/etl';

/** CloudTAK Device ID & a digest of the last state written, keyed by external ID */
export const DeviceCache = Type.Record(Type.String(), Type.Object({
    id: Type.String(),
    hash: Type.String()
}));

export type DeviceCache = Static<typeof DeviceCache>;

/** The SDK operations the sync uses */
export type DeviceAPI = {
    Device: Pick<CloudTAKAPI['Device'], 'list' | 'create' | 'update'>;
};

export type SyncedDevice = Pick<CoreDeviceCreate, 'name' | 'type' | 'geometry' | 'manufacturer' | 'model' | 'status' | 'remarks' | 'metadata' | 'links'>;

export type SyncedRecord = {
    external: string;
    device: SyncedDevice;
};

export type Counts = {
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
};

export type DeviceSyncOptions = {
    /** External ID system the records are filed under */
    system: string;
    /** TAK Channels the Devices are shared with - left as they are when empty */
    channels?: Array<number>;
};

/**
 * Keep CloudTAK Devices in step with an external system's records - a record
 * whose state matches the last write costs no API calls. Records that leave
 * the source keep their Device, nothing is deleted
 */
export class DeviceSync {
    api: DeviceAPI;
    cache: DeviceCache;
    opts: DeviceSyncOptions;
    counts: Counts = { created: 0, updated: 0, unchanged: 0, failed: 0 };
    seen = new Set<string>();

    static NAME_MAX_LENGTH = 64;
    static INDEX_PAGE_SIZE = 100;
    static INDEX_MAX_PAGES = 200;

    constructor(api: DeviceAPI, cache: DeviceCache, opts: DeviceSyncOptions) {
        this.api = api;
        this.cache = cache;
        this.opts = opts;
    }

    static clampName(name: string): string {
        return name.length > this.NAME_MAX_LENGTH ? `${name.slice(0, this.NAME_MAX_LENGTH - 1)}…` : name;
    }

    private static digest(value: unknown): string {
        return createHash('sha256').update(JSON.stringify(value)).digest('hex');
    }

    private static statusOf(err: unknown): number | null {
        if (err instanceof Error && 'status' in err && typeof err.status === 'number') return err.status;
        return null;
    }

    /**
     * Create or update the Device for a record - a failure is counted & logged
     * so one record never prevents the rest from being written
     */
    async sync(record: SyncedRecord): Promise<void> {
        if (this.seen.has(record.external)) return;
        this.seen.add(record.external);

        try {
            await this.write(record);
        } catch (err) {
            this.counts.failed++;
            console.error(`not ok - ${this.opts.system} ${record.external}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Run the records through sync() with a bounded number in flight
     */
    async syncAll(records: Array<SyncedRecord>, concurrency = 8): Promise<void> {
        const queue = [...records];

        await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            let record: SyncedRecord | undefined;
            while ((record = queue.shift())) await this.sync(record);
        }));
    }

    summary(): string {
        const c = this.counts;
        return `${this.seen.size} records: ${c.created} created, ${c.updated} updated, ${c.unchanged} unchanged, ${c.failed} failed`;
    }

    private async write(record: SyncedRecord): Promise<void> {
        const channels = this.opts.channels ?? [];
        const hash = DeviceSync.digest({ device: record.device, channels });

        let cached: DeviceCache[string] | undefined = this.cache[record.external];

        if (!cached) {
            const found = await this.find(record.external);
            if (found) cached = { id: found.id, hash: '' };
        }

        if (cached && cached.hash === hash) {
            this.cache[record.external] = cached;
            this.counts.unchanged++;
            return;
        }

        let device: CoreDevice | null = null;

        if (cached) {
            try {
                device = await this.api.Device.update(cached.id, {
                    ...record.device,
                    ...(channels.length ? { channels } : {})
                });
                this.counts.updated++;
            } catch (err) {
                if (DeviceSync.statusOf(err) !== 404) throw err;
                delete this.cache[record.external];
            }
        }

        if (!device) {
            device = await this.api.Device.create({
                ...record.device,
                external_id: { system: this.opts.system, value: record.external },
                serial: '',
                firmware: '',
                simulated: false,
                style: {},
                channels
            });
            this.counts.created++;
        }

        this.cache[record.external] = { id: device.id, hash };
    }

    /**
     * Find the Device previously created for a record when the cache has no
     * memory of it - the Devices visible to the task are indexed by external
     * ID once per run on the first miss
     */
    private async find(external: string): Promise<{ id: string } | null> {
        this.index ??= this.buildIndex();

        const id = (await this.index).get(external);

        return id ? { id } : null;
    }

    private index?: Promise<Map<string, string>>;

    private async buildIndex(): Promise<Map<string, string>> {
        const index = new Map<string, string>();

        for (let page = 0; page < DeviceSync.INDEX_MAX_PAGES; page++) {
            const list = await this.api.Device.list({ limit: DeviceSync.INDEX_PAGE_SIZE, page });

            for (const item of list.items) {
                const value = item.external_ids[this.opts.system];
                if (value && !index.has(value)) index.set(value, item.id);
            }

            if (list.items.length < DeviceSync.INDEX_PAGE_SIZE) break;
        }

        return index;
    }
}
