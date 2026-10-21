<h1 align='center'>ETL-ALERTWest</h1>

<p align='center'>Bring <a href='https://alertwest.org'>ALERTWest</a> wildfire camera locations into the TAK System</p>

## Overview

This ETL polls the public ALERTWest camera API (`GET /api/getCameraDataByLoc`) and registers one CloudTAK Core Device
per camera site - every public camera ALERTWest installs at one location - through the CloudTAK Device API. No API key
is required.

Each site Device carries:

- The site location as its Point geometry
- The site name (the portion of the camera names shared by every camera there, ie `Mt_Lewis_1` & `Mt_Lewis_2` give
  `Mt_Lewis`) and the `DeviceType` Symbol ID
- The camera provider as the manufacturer and the camera class(es) (`axis`, `cctv`, `flir`) as the model
- A status of `Full`, `Reduced` or `Offline` depending on how many of the site's cameras ALERTWest reports offline
- The latest image of every camera and the provider website(s) as links
- A `metadata` object conforming to the `site` Output schema - provider, sponsor, county, state, offline flag, camera
  count, most recent image URL/time and a `cameras` array with each camera's class/type, PTZ & offline flags,
  azimuth/elevation/zoom/fov, last moved time and image URL/time
- An external ID of the ALERTWest location id under the `alertwest` system

Devices are matched to sites by that external ID. The Device ID and a digest of the last state written are cached in
the Layer's ephemeral store, so an unchanged site costs no API calls and a site whose cache entry is missing is looked
up in the Device list before a new Device is created. A site that leaves the feed keeps its Device - nothing is deleted.

Latest images live on the ALERTWest image CDN under the camera id and the UTC capture date encoded in the screenshot
filename. The CDN stops serving old screenshots, so images older than a day are reported in `metadata.image_time` but not
linked. Private cameras & locations are never registered, and unlocated cameras are skipped and logged.

## Configuration

| Variable         | Description |
| ---------------- | ----------- |
| `BaseURL`        | Base URL of the public ALERTWest camera API - defaults to `https://api.cdn.prod.alertwest.com` |
| `States`         | Two letter state or province codes to include (ie `CA`, `CO`) - empty includes every camera |
| `Providers`      | Camera providers to include (ie `UCSD`, `ALERTWest`, `CALTRANS`, `FAA`, `UDOT`) - empty includes every provider |
| `IncludeOffline` | Include cameras ALERTWest reports as offline - off by default |
| `DeviceType`     | MIL-STD-2525E Symbol ID the site Devices are created with - defaults to `10031500002202000000`, a friendly emplaced sensor |
| `Channels`       | TAK Channel bitpos values the site Devices are shared with - empty leaves the Devices unshared and visible to admins only |
| `DEBUG`          | Print raw API responses in the layer logs |

The full feed is around 13,000 cameras across 40 states & provinces, most of them DOT traffic cameras - use the `States`
and/or `Providers` filters to keep the Layer to the cameras you need. Every site whose imagery changed is updated on each
run, so the Layer's compute timeout is sized for a few thousand sites.

The Layer token must hold the `device:create`, `device:read` & `device:update` permissions - all three are requested via
`capabilities.json`.

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
