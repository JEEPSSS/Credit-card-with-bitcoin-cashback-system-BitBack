# Reacticx components

Three components copied from [Reacticx](https://github.com/rit3zh/reacticx)
(MIT, see `LICENSE` in this folder), at commit `ca19ee8` of 25 September 2026.
Reacticx is a copy-in library: its components are meant to live in the app's
own source rather than be installed as a package, so they are kept here.

They need nothing the app did not already have: Skia, Reanimated, Worklets and
Gesture Handler, at the same versions Reacticx itself is built against
(Expo SDK 54, React Native 0.81.5, Reanimated 4.1, Skia 2.2.12).

| Folder | Used by | What it draws |
|---|---|---|
| `metal` | `components/PaymentCard.tsx` | The metal rim round the payment card |
| `border-beam` | `components/Beam.tsx` | The beam round an active boost |
| `masked-tab-bar` | `components/TabBar.tsx` | The bottom tab bar |

## Changes made here

Each is marked `BitBack:` in the source.

- **metal**: a `refraction` prop (default 0.6, the value that was fixed in the
  shader). On a thin border the fixed value drew the rim as a doubled line.
- **border-beam**: the canvas takes one flat style object instead of an array,
  which Skia's web canvas could not accept.
- **masked-tab-bar**:
  - each tab is exposed to screen readers as a tab with an "activate" action,
    and the duplicate layer under the pill is hidden from them. The bar is
    driven by a pan gesture, which a screen reader cannot perform;
  - `Label` takes `maxFontSizeMultiplier`;
  - the import of `create-compound-component` points at this folder.
