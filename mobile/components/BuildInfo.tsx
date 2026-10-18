import { Text, View } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

import { describeBuild } from "@/lib/build";
import { COLORS, fontSize, space } from "@/lib/theme";

/** Version, runtime, channel and update ID at the foot of More. See lib/build.ts. */
export function BuildInfo() {
  const lines = describeBuild({
    appVersion: Constants.expoConfig?.version ?? null,
    isEnabled: Updates.isEnabled,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    isEmergencyLaunch: Updates.isEmergencyLaunch,
    emergencyLaunchReason: Updates.emergencyLaunchReason,
  });
  return (
    <View accessible style={{ alignItems: "center", marginTop: space.lg, gap: 2 }}>
      {lines.map((line) => (
        <Text key={line} selectable style={{ color: COLORS.muted, fontSize: fontSize.caption, textAlign: "center" }}>
          {line}
        </Text>
      ))}
    </View>
  );
}
