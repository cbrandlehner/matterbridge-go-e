# matterbridge-go-e changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.1.5] - 2026-09-12

### Added

- RFID support via Matterbridge 3.10.9+: `Evse` is created with `rfid: true`, and go-e Modbus `UNLOCKED_BY` (203), `RFID_CARD` (327–331), and `ENERGY_CARD0–9` (332–371) are polled. A new or repeated card session emits the EnergyEvse `Rfid` event.

### Changed

- Replaced the Apple Home guide with a smart home controller matrix in [docs/SmartHome.md](./docs/SmartHome.md). Apple Home does not support Matter EVSE; Home Assistant remains the recommended controller.
- README: vendor-support disclaimer (`vendor_support-none` badge) and RFID register documentation.
- Dependency updates (Jest 30.5, oxlint 1.82, oxfmt 0.67, Vitest 5, and patch bumps). TypeScript stays on 6.x for `ts-jest` peer compatibility.

### Fixed

- Codecov CI: added Jest and Vitest coverage for Modbus, mDNS, and remaining platform branches so the 100% coverage gate can upload reports.

## [0.1.4] - 2026-08-22

### Added

- Lifetime charger energy (`ENERGY_TOTAL`) published to `ElectricalEnergyMeasurement.cumulativeEnergyImported` so Home Assistant can use a monotonically increasing kWh sensor on the Energy dashboard. Session energy remains on `EnergyEvse.sessionEnergyCharged`.

## [0.1.3] - 2026-07-20

### Fixed

- Hang on wrong/unreachable charger IP: Modbus close after a failed TCP connect never resolved (modbus-serial only completes `close()` when the socket was open), which blocked Matterbridge startup. Failed connections now use `destroy()` and close has a timeout fallback.

## [0.1.2] - 2026-07-03

### Fixed

- CI publish workflow: configure npm OIDC trusted publishing

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
