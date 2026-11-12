import { ReactNode } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { BEAM, motion, radius } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { BorderBeam } from "@/components/reacticx/border-beam";

/**
 * A beam of the accent colour that circles whatever it wraps.
 *
 * Used for one thing: a boost that is running. A boost lasts thirty days and
 * the card that reports it otherwise looks like every other card, so the beam
 * is what says "this is on, now". It is drawn over the card's own border by a
 * shader (Reacticx's BorderBeam, MIT; see components/reacticx) and touches
 * nothing inside it.
 *
 * The glow is kept inside the screen's 16pt side padding so it is not cut off
 * at the edge, and with the OS reduce-motion setting on the beam is not drawn
 * at all: the card keeps its accent border, which already marks it.
 */
const GLOW = 6;

export function Beam({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  if (reduced) return <View style={style}>{children}</View>;
  return (
    <BorderBeam
      colors={[...BEAM]}
      borderRadius={radius.card}
      borderWidth={1}
      glow={GLOW}
      duration={motion.beamSeconds}
      beamLength={0.3}
      ambient={0}
      style={style}
    >
      {children}
    </BorderBeam>
  );
}
