# CHANGELOG

## Emoji Cheatsheet
- :pencil2: doc updates
- :bug: when fixing a bug
- :rocket: when making general improvements
- :white_check_mark: when adding tests
- :arrow_up: when upgrading dependencies
- :tada: when adding new features

## Version History

### v2.0.0

- :tada: Sites are written as CloudTAK Core Devices through the `@tak-ps/etl` Device SDK instead of being submitted as CoT Features - one Device per site keyed by the ALERTWest location id under the `alertwest` external ID system, with the provider as manufacturer, camera class as model, a `Full`/`Reduced`/`Offline` status, image & provider links and the `site` metadata
- :tada: `DeviceType` input sets the MIL-STD-2525E Symbol ID of the site Devices and `Channels` shares them with TAK Channels
- :rocket: Device IDs & a digest of the last write are cached in the Layer ephemeral store so unchanged sites cost no API calls; a missing cache entry is recovered from the Device list
- :rocket: `feature:*` is no longer requested - the task requires `device:create`, `device:read` & `device:update`
- :white_check_mark: Unit tests for the Device sync and the control loop against a mock of the CloudTAK Device API

### v1.3.0

- :rocket: Merge cameras into a single Feature per site, named by the portion of the camera names they share

### v1.2.0

- :tada: Poll the public ALERTWest camera API (`GET /api/getCameraDataByLoc`) - no API key is required and `BaseURL` defaults to `https://api.cdn.prod.alertwest.com`
- :tada: `States`, `Providers` & `IncludeOffline` inputs filter the ~13k camera feed - private cameras & locations are always excluded
- :tada: Co-located cameras are merged into one Feature per site, named by the portion of the camera names they share, with every camera's latest image linked; the sensor bearing is kept only when the site has a single PTZ camera as a CoT holds one sensor cone
- :tada: Latest image URLs built from the camera screenshot filename on the ALERTWest image CDN and linked (`r-u`) alongside the provider website; screenshots older than a day are not linked
- :rocket: The `camera` Output schema is replaced by a `site` schema (id, name, county, state, provider, sponsor, offline, camera_count, image URL/time and a `cameras` array) - `APIKey`, `source`, `site_*`, `view_line`, `range`, manufacturer/model/serial are removed

### v1.1.1

- :arrow_up: Update Core Dependencies

### v1.1.0

- :arrow_up: Update Core Dependencies

### v1.0.0

- :tada: Poll the ALERTWest SAPI `GET /api/firecams/v0/cameras` endpoint and submit each located camera under the `camera` Output schema so a CloudTAK Layer Mapping can register it as a Core Device
- :tada: Derive camera azimuth & range from the ALERTWest view line and attach the latest image as a CoT link
- :white_check_mark: Unit tests for parsing, feature mapping & the control loop against a mock SAPI
