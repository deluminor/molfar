/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  // Native folders and compiled libraries are regenerated on EAS. Hash their
  // source inputs so local OTA publishing matches a clean cloud build.
  ignorePaths: [
    "ios",
    "ios/**/*",
    "android",
    "android/**/*",
    "modules/molfar-link/ios/*.xcframework",
    "modules/molfar-link/ios/*.xcframework/**/*",
    "modules/molfar-link/android/src/main/jniLibs",
    "modules/molfar-link/android/src/main/jniLibs/**/*",
  ],
  extraSources: [
    { type: "file", filePath: "../Cargo.toml", reasons: ["molfarRust"] },
    { type: "file", filePath: "../Cargo.lock", reasons: ["molfarRust"] },
    {
      type: "dir",
      filePath: "../crates/mobile-link",
      reasons: ["molfarRust"],
    },
    {
      type: "file",
      filePath: "scripts/build-native-link.mjs",
      reasons: ["molfarRust"],
    },
    {
      type: "file",
      filePath: "scripts/eas-build-pre-install.mjs",
      reasons: ["molfarRust"],
    },
  ],
};
