#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"

if ! command -v java >/dev/null 2>&1 || ! command -v javac >/dev/null 2>&1; then
  echo "缺少完整 JDK。请安装 JDK 21（含 javac）后重试。" >&2
  exit 1
fi

if [ ! -d "$SDK_ROOT" ]; then
  echo "未找到 Android SDK：$SDK_ROOT" >&2
  echo "请设置 ANDROID_SDK_ROOT，或安装 Android Studio 后使用默认 SDK 目录。" >&2
  exit 1
fi

if [ ! -d "$ANDROID_DIR" ]; then
  echo "正在生成 Android 原生工程…"
  (cd "$PROJECT_DIR" && npx expo prebuild --platform android)
fi

printf 'sdk.dir=%s\n' "${SDK_ROOT//\/\\}" > "$ANDROID_DIR/local.properties"

export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"
export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")}" 

echo "开始构建 arm64 调试 APK…"
(cd "$ANDROID_DIR" && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=1)

APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "构建未产生 APK：$APK" >&2
  exit 1
fi

echo "构建完成：$APK"
echo "安装命令：adb install -r \"$APK\""
