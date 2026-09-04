/**
 * plugins/withCmakeVersion.js
 * --------------------------------------------------------------
 * Local Expo config plugin that pins a modern CMake version in the
 * generated `android/app/build.gradle`.
 *
 * Why: Expo SDK 57 + NDK 27 default to CMake 3.22.1, which is too old
 * to detect NDK >= 22 correctly. During its LTO/IPO self-check it
 * injects `-fuse-ld=gold`, a linker that NDK 27 removed, so the native
 * build fails with `invalid linker name in argument '-fuse-ld=gold'`.
 * Pinning CMake >= 3.25.3 (we use 3.30.5) fixes this.
 *
 * The android/ folder is gitignored/CNG, so this config plugin is the
 * durable way to apply the override every time `expo prebuild` runs.
 * --------------------------------------------------------------
 */

const { withAppBuildGradle } = require('@expo/config-plugins');

const CMAKE_VERSION = '3.30.5';

/**
 * Inserts `externalNativeBuild { cmake { version = "X" } }` inside the
 * `android { }` block of the app build.gradle, if it is not already
 * present.
 */
function withCmakeVersion(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('externalNativeBuild')) {
      return config;
    }

    // Insert right after the `android {` line so it lands inside the block.
    const marker = /(\n\s*android\s*\{\n)/;
    if (!marker.test(contents)) {
      return config;
    }

    const insertion = `    externalNativeBuild {\n        cmake {\n            version = "${CMAKE_VERSION}"\n        }\n    }\n`;
    contents = contents.replace(marker, (match) => `${match}${insertion}`);
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withCmakeVersion;
