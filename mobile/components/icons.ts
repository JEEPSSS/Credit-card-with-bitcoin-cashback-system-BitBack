/**
 * Every icon the app draws, each imported from its own module.
 *
 * Importing from "lucide-react-native" itself loads the package index, which
 * requires all 1,638 icons. Metro does not tree-shake, so the full set was
 * 29% of the JavaScript bundle (1.39 MB of 5.29 MB) for the few dozen used
 * here, and every one of those modules ran at startup. Importing each icon's
 * own file ships only these. Measured before and after in docs/APP_AUDIT.md.
 *
 * Nothing else may import from "lucide-react-native" except `import type`,
 * which is erased at build time.
 */
import type { LucideIcon } from "lucide-react-native";

import ArrowUpRight from "lucide-react-native/dist/esm/icons/arrow-up-right";
import Award from "lucide-react-native/dist/esm/icons/award";
import Bell from "lucide-react-native/dist/esm/icons/bell";
import Bitcoin from "lucide-react-native/dist/esm/icons/bitcoin";
import BookOpen from "lucide-react-native/dist/esm/icons/book-open";
import Car from "lucide-react-native/dist/esm/icons/car";
import Carrot from "lucide-react-native/dist/esm/icons/carrot";
import ChevronLeft from "lucide-react-native/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right";
import ClipboardList from "lucide-react-native/dist/esm/icons/clipboard-list";
import Clock from "lucide-react-native/dist/esm/icons/clock";
import Coins from "lucide-react-native/dist/esm/icons/coins";
import Compass from "lucide-react-native/dist/esm/icons/compass";
import CreditCard from "lucide-react-native/dist/esm/icons/credit-card";
import Crown from "lucide-react-native/dist/esm/icons/crown";
import FileText from "lucide-react-native/dist/esm/icons/file-text";
import Flame from "lucide-react-native/dist/esm/icons/flame";
import Gamepad2 from "lucide-react-native/dist/esm/icons/gamepad-2";
import Gem from "lucide-react-native/dist/esm/icons/gem";
import Gift from "lucide-react-native/dist/esm/icons/gift";
import HeartPulse from "lucide-react-native/dist/esm/icons/heart-pulse";
import Home from "lucide-react-native/dist/esm/icons/house";
import LayoutGrid from "lucide-react-native/dist/esm/icons/layout-grid";
import Lock from "lucide-react-native/dist/esm/icons/lock";
import Medal from "lucide-react-native/dist/esm/icons/medal";
import Moon from "lucide-react-native/dist/esm/icons/moon";
import Mountain from "lucide-react-native/dist/esm/icons/mountain";
import PartyPopper from "lucide-react-native/dist/esm/icons/party-popper";
import Plane from "lucide-react-native/dist/esm/icons/plane";
import Repeat from "lucide-react-native/dist/esm/icons/repeat";
import Scale from "lucide-react-native/dist/esm/icons/scale";
import Send from "lucide-react-native/dist/esm/icons/send";
import Shield from "lucide-react-native/dist/esm/icons/shield";
import ShieldAlert from "lucide-react-native/dist/esm/icons/shield-alert";
import ShieldCheck from "lucide-react-native/dist/esm/icons/shield-check";
import ShoppingBag from "lucide-react-native/dist/esm/icons/shopping-bag";
import Sparkles from "lucide-react-native/dist/esm/icons/sparkles";
import Target from "lucide-react-native/dist/esm/icons/target";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2";
import TrendingDown from "lucide-react-native/dist/esm/icons/trending-down";
import TrendingUp from "lucide-react-native/dist/esm/icons/trending-up";
import Trophy from "lucide-react-native/dist/esm/icons/trophy";
import User from "lucide-react-native/dist/esm/icons/user";
import Utensils from "lucide-react-native/dist/esm/icons/utensils";
import Wallet from "lucide-react-native/dist/esm/icons/wallet";
import Waves from "lucide-react-native/dist/esm/icons/waves";
import Zap from "lucide-react-native/dist/esm/icons/zap";

export type { LucideIcon };
export {
  ArrowUpRight, Award, Bell, ChevronLeft, ChevronRight, ClipboardList, Clock, Coins, CreditCard,
  Flame, Gift, Home, LayoutGrid, Lock, PartyPopper, Repeat, Send, ShieldAlert, ShieldCheck,
  Sparkles, Target, Trash2, TrendingDown, TrendingUp, User, Wallet,
};

/**
 * Icons the backend refers to by name: categories, badges, levels, personas,
 * goals and notifications. tests/test_icon_names.py fails if the backend can
 * send a name that is missing here, so a new badge cannot render as a blank.
 */
const BY_NAME: Record<string, LucideIcon> = {
  "award": Award,
  "bell": Bell,
  "bitcoin": Bitcoin,
  "book-open": BookOpen,
  "car": Car,
  "carrot": Carrot,
  "compass": Compass,
  "credit-card": CreditCard,
  "crown": Crown,
  "file-text": FileText,
  "flame": Flame,
  "gamepad-2": Gamepad2,
  "gem": Gem,
  "gift": Gift,
  "heart-pulse": HeartPulse,
  "lock": Lock,
  "medal": Medal,
  "moon": Moon,
  "mountain": Mountain,
  "plane": Plane,
  "scale": Scale,
  "shield": Shield,
  "shield-alert": ShieldAlert,
  "shopping-bag": ShoppingBag,
  "sparkles": Sparkles,
  "target": Target,
  "trending-up": TrendingUp,
  "trophy": Trophy,
  "utensils": Utensils,
  "waves": Waves,
  "zap": Zap,
};

export function iconNamed(name: string | undefined, fallback: LucideIcon = CreditCard): LucideIcon {
  return (name && BY_NAME[name]) || fallback;
}
