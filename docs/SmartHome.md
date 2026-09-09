# Smart home controllers

This plugin exposes go-e chargers as Matter **Energy EVSE** devices. Support depends on the Matter controller.

| Controller | EVSE support |
|------------|--------------|
| Apple Home | Not supported. The charger may pair but Home shows it as an unsupported type with no EVSE controls or energy data. Energy views in Home cover smart plugs and outlets, not EV chargers. |
| Home Assistant | Full Matter EVSE support |
| Google Home | Limited |
| Amazon Alexa | EVSE not supported |

**Home Assistant** is the recommended controller for this plugin.
