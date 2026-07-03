# Apple Home requirements

This plugin exposes go-e chargers as Matter **Energy EVSE** devices. Apple Home support for this device category depends on the controller software version.

## iOS 27 beta is required

**To use matterbridge-go-e with Apple Home, you must run iOS 27 beta** (or a later release that includes the same Matter energy and EVSE capabilities) on the iPhone or iPad that controls your home.

Earlier Apple Home releases—including iOS 26.x—do not support Matter EVSE accessories. The charger may pair through the Matterbridge bridge and appear as a device, but Home reports it as an unsupported type and provides no EVSE controls or energy views.

iOS 27 is **currently in beta**. Install it through the [Apple Beta Software Program](https://beta.apple.com/) before pairing or using this plugin with Apple Home.

### What iOS 27 beta enables

Based on the current iOS 27 developer beta, Apple Home adds Matter-based **energy management**:

- A dedicated **Energy** tab that can list compatible Matter devices
- Consumption reporting for devices that expose Matter energy clusters

This plugin publishes the clusters Apple expects for EVSE and energy reporting (`EnergyEvse`, `ElectricalPowerMeasurement`, `ElectricalEnergyMeasurement`, `DeviceEnergyManagement`). Functionality in Home may still evolve while iOS 27 is in beta.

### Home hub

Use a supported home hub on the same software generation where possible:

- HomePod (2nd generation) or HomePod mini with **HomePod Software 27** beta
- Apple TV 4K with **tvOS 27** beta

Pairing and control from an iOS 27 device can work without a hub for some accessories, but a current home hub improves reliability for bridged Matter devices.

## Pairing checklist

1. Install **iOS 27 beta** on your iPhone or iPad.
2. Update your **home hub** to the matching beta, if you use one.
3. Enable **Modbus TCP** on the go-e charger (app or `http://<charger-ip>/api/set?men=true`).
4. Start Matterbridge with this plugin enabled.
5. Add the Matterbridge bridge in the Home app using the QR code or manual pairing code.
6. Confirm **C2Home_Gemini_206540** (or your configured charger name) appears under the bridge.
7. Open the **Energy** tab to verify consumption data once the charger is online.

## Known limitations

- **Beta software:** iOS 27 is pre-release. Expect bugs, changed behaviour between beta builds, and features that are incomplete (for example, energy-based automations are not available yet in Home).
- **Bridged devices:** This plugin registers the charger as a **bridged** child device of the Matterbridge aggregator. Apple Home support for bridged Matter EVSE devices may differ from native, standalone Matter chargers.
- **No automations yet:** Energy metrics in the iOS 27 beta are primarily for viewing. They are not available as Shortcuts triggers or Home automations at this time.

## Other Matter controllers

iOS 27 is required **only for Apple Home**. Other controllers do not have this restriction:

| Controller | iOS 27 required? | EVSE support |
|------------|------------------|--------------|
| Apple Home | **Yes** (iOS 27 beta) | EVSE and energy (beta) |
| Home Assistant | No | Full Matter EVSE support |
| Google Home | No | Limited |
| Amazon Alexa | No | EVSE not supported |

For production use outside Apple’s beta program, **Home Assistant** remains the most complete Matter EVSE option today.

## References

- [Apple Beta Software Program](https://beta.apple.com/)
- [Pair and manage Matter accessories (Apple Support)](https://support.apple.com/en-us/102135)
- [iOS 27 Apple Home energy management (Matter Alpha)](https://www.matteralpha.com/industry-news/ios-27-apple-home-thread-1-4-4k-energy)
- [go-e Modbus specification](https://github.com/goecharger/go-eCharger-API-v2/blob/main/modbus-en.md)
- [Matterbridge documentation](https://matterbridge.io)