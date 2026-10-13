<h1 align='center'>ETL-ALERTWest</h1>

<p align='center'>Bring <a href='https://alertwest.org'>ALERTWest</a> wildfire camera locations into the TAK System</p>

## Overview

This ETL polls the ALERTWest SAPI [`GET /api/firecams/v0/cameras`](https://docs.alertwest.org/docs/OpenAPI/Reference/get-cameras)
endpoint and submits every camera that has a site location to CloudTAK under the `camera` Output schema.

Each submitted Feature carries:

- The site location as a Point (with altitude when ALERTWest reports one)
- The camera name as the callsign and `b-m-p-s-p-loc` (Sensor Point) as the CoT type
- A `sensor` block with the azimuth & range derived from the ALERTWest view line, so TAK clients can draw the camera bearing
- The latest image as a CoT link
- A `metadata` object conforming to the `camera` schema - site, county, state, hardware (manufacturer, model, serial), pan/tilt/zoom, image URL/time, azimuth & range

Cameras without a site latitude/longitude are skipped and logged.

## Configuration

| Variable  | Description |
| --------- | ----------- |
| `BaseURL` | Base URL of the ALERTWest SAPI - provided by ALERTWest alongside your API key. The ETL appends `api/firecams/v0/cameras` to it |
| `APIKey`  | ALERTWest SAPI key - sent as the `x-api-key` header on every request |
| `DEBUG`   | Print raw API responses in the layer logs |

## Device API

To register each camera as a CloudTAK Core Device rather than (or as well as) a CoT marker, add a Layer Mapping for the
`camera` schema with the **Core Device** destination. The Features in the `camera` submission expose the following metadata
fields for the Mapping templates:

| Core Device field | Suggested template |
| ----------------- | ------------------ |
| Name              | `{{name}}` |
| Type              | A MIL-STD-2525E Symbol ID for a ground sensor - ie `10031500001200000000` |
| Manufacturer      | `{{manufacturer}}` |
| Model             | `{{model}}` |
| Serial            | `{{serial}}` |
| External ID       | system `alertwest`, value `{{source}}` |
| Remarks           | `{{county}}, {{state}}` |

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

The test suite runs against a mock SAPI and never contacts ALERTWest

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
