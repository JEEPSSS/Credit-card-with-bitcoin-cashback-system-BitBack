/**
 * Let the app handle a change of system text size itself.
 *
 * Expo's Android template lists the configuration changes MainActivity handles
 * (keyboard, orientation, screen size, uiMode) but not fontScale. So changing
 * the text size in Android settings while BitBack was open destroyed and
 * recreated the activity: the JavaScript app restarted on Home, anything typed
 * was lost, and text was measured at the old size until a full restart. Found
 * on a device. Handling fontScale here keeps the activity, and the app re-lays
 * itself out (components/ui.tsx keys screen content on the font scale).
 *
 * Native configuration: takes effect only in a new APK, not an update.
 */
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withFontScaleConfigChange(config) {
  return withAndroidManifest(config, (mod) => {
    const activities = mod.modResults.manifest.application?.[0]?.activity ?? [];
    for (const activity of activities) {
      if (activity.$["android:name"] !== ".MainActivity") continue;
      const changes = (activity.$["android:configChanges"] ?? "").split("|").filter(Boolean);
      if (!changes.includes("fontScale")) changes.push("fontScale");
      activity.$["android:configChanges"] = changes.join("|");
    }
    return mod;
  });
};
