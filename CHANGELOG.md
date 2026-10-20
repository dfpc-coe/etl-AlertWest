# CHANGELOG

## Emoji Cheatsheet
- :pencil2: doc updates
- :bug: when fixing a bug
- :rocket: when making general improvements
- :white_check_mark: when adding tests
- :arrow_up: when upgrading dependencies
- :tada: when adding new features

## Version History

### v1.2.0

- :tada: Poll the public ALERTWest camera API (`GET /api/getCameraDataByLoc`) - no API key is required and `BaseURL` defaults to `https://api.cdn.prod.alertwest.com`
- :tada: `States`, `Providers` & `IncludeOffline` inputs filter the ~13k camera feed - private cameras & locations are always excluded
- :tada: Latest image URL built from the camera screenshot filename on the ALERTWest image CDN and linked (`r-u`) alongside the provider website; screenshots older than a day are not linked
- :rocket: `camera` schema reworked around the public feed (id, location_id, provider, sponsor, camera class/type, ptz, offline, azimuth, elevation, fov...) - `APIKey`, `source`, `site_*`, `view_line`, `range`, manufacturer/model/serial are removed

### v1.1.1

- :arrow_up: Update Core Dependencies

### v1.1.0

- :arrow_up: Update Core Dependencies

### v1.0.0

- :tada: Poll the ALERTWest SAPI `GET /api/firecams/v0/cameras` endpoint and submit each located camera under the `camera` Output schema so a CloudTAK Layer Mapping can register it as a Core Device
- :tada: Derive camera azimuth & range from the ALERTWest view line and attach the latest image as a CoT link
- :white_check_mark: Unit tests for parsing, feature mapping & the control loop against a mock SAPI
