// Types for importing one lucide icon module at a time; see components/icons.ts.
declare module "lucide-react-native/dist/esm/icons/*" {
  const Icon: import("lucide-react-native").LucideIcon;
  export default Icon;
}
