import type { Static, TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { fetch } from '@tak-ps/etl';

const CAMERAS_PATH = 'api/firecams/v0/cameras';

const Nullable = <T extends TSchema>(type: T) => Type.Union([Type.Null(), type]);
const Text = Nullable(Type.String());

/** Camera record as returned by GET /api/firecams/v0/cameras */
export const Camera = Type.Object({
    name: Type.String(),
    source: Type.String(),
    site: Type.Optional(Nullable(Type.Object({
        id: Type.Optional(Nullable(Type.Union([Type.String(), Type.Integer()]))),
        description: Type.Optional(Text),
        latitude: Type.Optional(Nullable(Type.Union([Type.String(), Type.Number()]))),
        longitude: Type.Optional(Nullable(Type.Union([Type.String(), Type.Number()]))),
        altitude: Type.Optional(Nullable(Type.Union([Type.String(), Type.Number()]))),
        county: Type.Optional(Text),
        state: Type.Optional(Text),
        time: Type.Optional(Text)
    }))),
    image: Type.Optional(Nullable(Type.Object({
        time: Type.Optional(Text),
        url: Type.Optional(Text)
    }))),
    position: Type.Optional(Nullable(Type.Object({
        time: Type.Optional(Text),
        pan: Type.Optional(Nullable(Type.Union([Type.String(), Type.Number()]))),
        tilt: Type.Optional(Nullable(Type.Union([Type.String(), Type.Number()]))),
        zoom: Type.Optional(Nullable(Type.Union([Type.String(), Type.Number()])))
    }))),
    parameters: Type.Optional(Nullable(Type.Object({
        time: Type.Optional(Text),
        'Properties.System.SerialNumber': Type.Optional(Text),
        'Brand.Brand': Type.Optional(Text),
        'Brand.ProdNbr': Type.Optional(Text)
    }))),
    view: Type.Optional(Nullable(Type.Object({
        time: Type.Optional(Text),
        line: Type.Optional(Text)
    })))
});

export type AlertWestOptions = {
    url: string;
    key: string;
    debug?: boolean;
};

export default class AlertWest {
    base: URL;
    key: string;
    debug: boolean;

    constructor(opts: AlertWestOptions) {
        this.base = new URL(opts.url.endsWith('/') ? opts.url : `${opts.url}/`);
        this.key = opts.key;
        this.debug = opts.debug ?? false;
    }

    async cameras(): Promise<Array<Static<typeof Camera>>> {
        const url = new URL(CAMERAS_PATH, this.base);

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'x-api-key': this.key
            },
            safeUrlAllow: [this.base.origin]
        });

        if (!res.ok) {
            throw new Error(`ALERTWest ${CAMERAS_PATH} Failed: ${res.status} ${await res.text()}`);
        }

        const body = await res.json();
        if (this.debug) console.log(`ok - ALERTWest ${CAMERAS_PATH}:`, JSON.stringify(body));

        if (!Array.isArray(body)) {
            throw new Error(`ALERTWest ${CAMERAS_PATH} returned an unexpected response shape`);
        }

        return body.map((camera) => this.camera(camera));
    }

    private camera(body: unknown): Static<typeof Camera> {
        return Value.Parse(Camera, body);
    }
}

