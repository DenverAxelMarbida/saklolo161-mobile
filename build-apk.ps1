# build-apk.ps1
# --------------------------------------------------------------
# Build the Android release APK for Saklolo 161.
#
# Usage:
#   .\build-apk.ps1                 # normal release build
#
# NOTE: This script does NOT run `expo prebuild`. When app.json or
# native modules change, run these first, then this script (the
# android/ folder is gitignored/CNG and regenerated from app.json):
#
#   npx expo prebuild --platform android
#   .\build-apk.ps1
#
# The script auto-detects JDK 17 and the Android SDK from their
# standard install locations, so no permanent environment variables
# are required. If you use non-standard paths, set JAVA_HOME and/or
# ANDROID_HOME yourself before running and the script will respect
# your values.
# --------------------------------------------------------------

# 1. Resolve JDK 17 (prefer Eclipse Adoptium; allow manual override)
if (-not $env:JAVA_HOME) {
  $jdkCandidates = @(
    "C:\Program Files\Eclipse Adoptium",
    "$env:LOCALAPPDATA\Programs\Eclipse Adoptium"
  )
  $jdk = Get-ChildItem $jdkCandidates -Directory -ErrorAction SilentlyContinue |
         Where-Object { $_.Name -match "jdk-17" } |
         Sort-Object FullName -Descending |
         Select-Object -First 1 -ExpandProperty FullName
  if (-not $jdk) {
    throw "JDK 17 not found under C:\Program Files\Eclipse Adoptium or %LOCALAPPDATA%\Programs\Eclipse Adoptium. Install Eclipse Adoptium JDK 17 or set JAVA_HOME manually."
  }
  $env:JAVA_HOME = $jdk
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# 2. Resolve Android SDK (allow manual override)
if (-not $env:ANDROID_HOME) {
  $sdk = "$env:LOCALAPPDATA\Android\Sdk"
  if (-not (Test-Path $sdk)) {
    throw "Android SDK not found at $sdk. Set ANDROID_HOME manually."
  }
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
}

# 3. Run the release build
Set-Location (Join-Path $PSScriptRoot "android")
.\gradlew assembleRelease

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host ("APK: " + (Join-Path $PSScriptRoot 'android\app\build\outputs\apk\release\app-release.apk')) -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host ("Build failed (exit code " + $LASTEXITCODE + ").") -ForegroundColor Red
  exit $LASTEXITCODE
}
