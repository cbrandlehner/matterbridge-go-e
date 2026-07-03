# matterbridge-go-e changelog

All notable changes to this project are documented in this file.

## [0.1.1] - 2026-07-03

### Fixed

- CI publish workflow: add Jest `--forceExit` to prevent hung test runs

## [0.1.0] - 2026-07-03

### Added

- Initial release: go-e Gemini and PRO EV chargers as Matter Energy EVSE devices via Modbus TCP
- Matter commands: disable charging, enable charging with current limit
- Offline detection with automatic reconnect
- Optional mDNS discovery (`_go-e._go-eCharger._tcp.`)
- Electrical power metrics on ElectricalSensor child endpoint
- Apple Home pairing guide ([docs/APPLE_HOME.md](./docs/APPLE_HOME.md))
