<h1 align='center'>ETL-ALERTWest</h1>

<p align='center'>Bring <a href='https://alertwest.org'>ALERTWest</a> wildfire camera locations into the TAK System</p>

## Overview

This ETL polls the public ALERTWest camera API (`GET /api/getCameraDataByLoc`) and submits every public, located camera to
CloudTAK under the `camera` Output schema. No API key is required.

Each submitted Feature carries:

- The camera location as a Point
- The camera name as the callsign and `b-m-p-s-p-loc` (Sensor Point) as the CoT type
- A `sensor` block with the azimuth & field of view of PTZ cameras, so TAK clients can show the camera bearing
- The latest image (`r-u` link, shown as a thumbnail in CloudTAK and a tappable link in ATAK) and the provider website
- A `metadata` object conforming to the `camera` schema - provider, sponsor, county, state, camera class/type, PTZ &
  offline flags, azimuth/elevation/zoom/fov, last moved time, image URL/time

Latest images live on the ALERTWest image CDN under the camera id and the UTC capture date encoded in the screenshot
filename. The CDN stops serving old screenshots, so images older than a day are reported in `metadata.image_time` but not
linked. Private cameras & locations are never submitted, and unlocated cameras are skipped and logged.

## Configuration

| Variable         | Description |
| ---------------- | ----------- |
| `BaseURL`        | Base URL of the public ALERTWest camera API - defaults to `https://api.cdn.prod.alertwest.com` |
| `States`         | Two letter state or province codes to include (ie `CA`, `CO`) - empty includes every camera |
| `Providers`      | Camera providers to include (ie `UCSD`, `ALERTWest`, `CALTRANS`, `FAA`, `UDOT`) - empty includes every provider |
| `IncludeOffline` | Include cameras ALERTWest reports as offline - off by default |
| `DEBUG`          | Print raw API responses in the layer logs |

The full feed is around 13,000 cameras across 40 states & provinces, most of them DOT traffic cameras - use the `States`
and/or `Providers` filters to keep the Layer to the cameras you need.

## Device API

To register each camera as a CloudTAK Core Device rather than (or as well as) a CoT marker, add a Layer Mapping for the
`camera` schema with the **Core Device** destination. The Features in the `camera` submission expose the following metadata
fields for the Mapping templates:

| Core Device field | Suggested template |
| ----------------- | ------------------ |
| Name              | `{{name}}` |
| Type              | A MIL-STD-2525E Symbol ID for a ground sensor - ie `10031500001200000000` |
| Manufacturer      | `{{camera_class}}` |
| Model             | `{{camera_type}}` |
| Serial            | `{{hostname}}` |
| External ID       | system `alertwest`, value `{{id}}` |
| Remarks           | `{{provider}} - {{county}}, {{state}}` |

The Layer token must hold the `device:create` & `device:update` permissions for a Core Device Mapping to be accepted - both are
requested via `capabilities.json`. Features that match no Core Device Mapping are delivered to the TAK Server as CoT.

## Development

DFPC provided Lambda ETLs are currently all written in [NodeJS](https://nodejs.org/en) through the use of a AWS Lambda optimized
Docker container. Documentation for the Dockerfile can be found in the [AWS Help Center](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)

```sh
npm install
```

Add a .env file in the root directory that gives the ETL script the necessary variables to communicate with a local ETL server.
When the ETL is deployed the `ETL_API` and `ETL_LAYER` variables will be provided by the Lambda Environment

```json
{
    "ETL_API": "http://localhost:5001",
    "ETL_LAYER": "19"
}
```

To run the task, ensure the local [CloudTAK](https://github.com/dfpc-coe/CloudTAK/) server is running and then run with typescript runtime
or build to JS and run natively with node

```
ts-node task.ts
```

```
npm run build
cp .env dist/
node dist/task.js
```

### Testing

The test suite runs against a mock of the ALERTWest API and never contacts ALERTWest

```sh
npm test
```

### Deployment

Deployment into the CloudTAK environment for configuration is done via automatic releases to the DFPC AWS environment.

Github actions will build and push docker releases on every version tag which can then be automatically configured via the
CloudTAK API.

Builds are performed by the `cloudtak-etl` script provided by [`@tak-ps/etl`](https://github.com/dfpc-coe/etl-base).
It requires a `capabilities.json` document alongside the `Dockerfile` which describes the task (name, description,
compute requirements, permissions & invocation types) and is validated and embedded in the OCI Image Manifest as a
`com.cloudtak.capabilities` annotation so CloudTAK can read it directly from ECR before the task is ever deployed.
Update `capabilities.json` whenever the task's requirements change.

To build & push manually:

```sh
export AWS_REGION='us-east-1'
export AWS_ACCOUNT_ID='123456789012'
export Environment='prod' # Optional - defaults to prod

npx cloudtak-etl
```

Non-DFPC users will need to setup their own docker => ECS build system via something like Github Actions or AWS Codebuild.
