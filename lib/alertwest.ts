import type { Static, TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { fetch } from '@tak-ps/etl';

export const DEFAULT_URL = 'https://api.cdn.prod.alertwest.com';
export const IMAGE_URL = 'https://img.cdn.prod.alertwest.com';

const CAMERAS_PATH = 'api/getCameraDataByLoc';

const Nullable = <T extends TSchema>(type: T) => Type.Union([Type.Null(), type]);
const Text = Type.Optional(Nullable(Type.String()));
const Numeric = Type.Optional(Nullable(Type.Union([Type.String(), Type.Number()])));
const Flag = Type.Optional(Nullable(Type.Union([Type.Boolean(), Type.Integer(), Type.String()])));

/**
 * Camera location as returned by GET /api/getCameraDataByLoc - the `key`
 * object in the response maps each short key to its name (locId, locLat...)
 */
export const Location = Type.Object({
    id: Type.Union([Type.String(), Type.Integer()]),
    lat: Numeric,
    lon: Numeric,
    st: Text,
    lp: Flag
});

/**
 * Camera as returned by GET /api/getCameraDataByLoc - short keys are
 * expanded by the `key` object in the response (camId, camName, camAzimuth...)
 */
export const Camera = Type.Object({
    id: Type.Union([Type.String(), Type.Integer()]),
    lid: Type.Union([Type.String(), Type.Integer()]),
    cn: Text,
    hn: Text,
    img: Text,
    p: Numeric,
    t: Numeric,
    z: Numeric,
    fov: Numeric,
    lmt: Numeric,
    cl: Numeric,
    off: Flag,
    pv: Flag,
    ptz: Flag,
    cc: Text,
    typ: Text,
    co: Text,
    st: Text,
    pr: Text,
    pl: Text,
    sp: Text,
    isp: Text
});

const Response = Type.Object({
    code: Type.Optional(Type.Union([Type.Integer(), Type.String()])),
    err: Type.Optional(Nullable(Type.String())),
    // An array on error responses, an object on success
    data: Type.Optional(Type.Unknown())
});

const Data = Type.Object({
    locs: Type.Optional(Nullable(Type.Object({
        data: Type.Optional(Nullable(Type.Array(Type.Unknown())))
    }))),
    cams: Type.Optional(Nullable(Type.Object({
        data: Type.Optional(Nullable(Type.Array(Type.Unknown())))
    })))
});

export type CameraData = {
    cameras: Array<Static<typeof Camera>>;
    locations: Map<string, Static<typeof Location>>;
};

export type AlertWestOptions = {
    url?: string;
    debug?: boolean;
};

export default class AlertWest {
    base: URL;
    debug: boolean;

    constructor(opts: AlertWestOptions = {}) {
        const url = opts.url || DEFAULT_URL;
        this.base = new URL(url.endsWith('/') ? url : `${url}/`);
        this.debug = opts.debug ?? false;
    }

    async cameras(): Promise<CameraData> {
        const url = new URL(CAMERAS_PATH, this.base);

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            },
            safeUrlAllow: [this.base.origin]
        });

        if (!res.ok) {
            throw new Error(`ALERTWest ${CAMERAS_PATH} Failed: ${res.status} ${await res.text()}`);
        }

        const body = Value.Parse(Response, await res.json());
        if (this.debug) console.log(`ok - ALERTWest ${CAMERAS_PATH}:`, JSON.stringify(body));

        if (Number(body.code) !== 1 || !Value.Check(Data, body.data)) {
            throw new Error(`ALERTWest ${CAMERAS_PATH} Failed: ${body.err || 'unexpected response'}`);
        }

        const data = body.data;

        const locations = new Map<string, Static<typeof Location>>();
        for (const loc of data.locs?.data ?? []) {
            const location = Value.Parse(Location, loc);
            locations.set(String(location.id), location);
        }

        const cameras = (data.cams?.data ?? []).map((cam) => Value.Parse(Camera, cam));

        return { cameras, locations };
    }
}
