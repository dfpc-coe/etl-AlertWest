# CHANGELOG

## Emoji Cheatsheet
- :pencil2: doc updates
- :bug: when fixing a bug
- :rocket: when making general improvements
- :white_check_mark: when adding tests
- :arrow_up: when upgrading dependencies
- :tada: when adding new features

## Version History

### v1.1.0

- :arrow_up: Update Core Dependencies

### v1.0.0

- :tada: Poll the ALERTWest SAPI `GET /api/firecams/v0/cameras` endpoint and submit each located camera under the `camera` Output schema so a CloudTAK Layer Mapping can register it as a Core Device
- :tada: Derive camera azimuth & range from the ALERTWest view line and attach the latest image as a CoT link
- :white_check_mark: Unit tests for parsing, feature mapping & the control loop against a mock SAPI
