import { Text, View } from "react-native";

import { COLORS, font, fontSize, space } from "@/lib/theme";
import { Button } from "@/components/ui";

/**
 * Expo Router renders this when a route throws during render.
 *
 * Without it a single render exception blanks the whole app with no way back,
 * which during a live demo means restarting the bundler. `retry` re-mounts the
 * route, so a transient failure costs a tap rather than the session.
 */
export function RouteErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", padding: space.xl }}>
      <Text style={{ color: COLORS.text, fontSize: fontSize.title, fontFamily: font.medium }}>
        This screen hit a problem
      </Text>
      <Text
        style={{
          color: COLORS.muted,
          fontSize: fontSize.caption,
          marginTop: space.md,
          lineHeight: 20,
        }}
      >
        {error.message || "Something went wrong while rendering."}
      </Text>
      <Button label="Try again" onPress={() => void retry()} style={{ marginTop: space.xl }} />
    </View>
  );
}
