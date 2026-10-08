# Sancharie mobile app icon

Use `app-icon-1024.png` as the source artwork for the iOS App Store / Xcode AppIcon set and as the full-color launcher source for Android. It is a square, full-bleed PNG; let iOS and Android apply their platform shape masks.

For Android adaptive icons, use:

- Foreground: `android-adaptive-foreground.png` (transparent PNG)
- Background color: `#082F42`

The SVG source files are in `../public/icons/`. The website's PWA icons are in the web `public/icons/` folder and its manifest references the 192 px and 512 px exports.

The mobile application source project is maintained separately, so its native launcher icon must be installed into that project's iOS/Android asset catalogs by its developer.
