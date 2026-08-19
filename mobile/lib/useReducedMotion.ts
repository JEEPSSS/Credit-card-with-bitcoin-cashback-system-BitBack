import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the OS "reduce motion" setting is on.
 *
 * Vestibular disorders make large or repeated movement genuinely unpleasant,
 * and both platforms expose a system switch for it that an app is expected to
 * honour — WCAG 2.2 lists it under Animation from Interactions (2.3.3).
 *
 * This app animates deliberately and in few places, so honouring the setting is
 * cheap: the odometer snaps to its value instead of rolling, entrances land
 * without a slide, and the skeleton shimmer holds still. Nothing is lost except
 * the movement, which is the point.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
