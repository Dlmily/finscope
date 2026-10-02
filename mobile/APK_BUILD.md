# 无 Expo 账户构建 Android 调试 APK

本工程可以在**不登录 Expo、不使用 EAS**的情况下通过 Android Gradle 生成调试 APK。该 APK 仅适合内部测试；它使用 Android 默认的 debug 签名，不能直接用于应用商店发布。

## 所需环境

| 组件 | 建议版本 | 用途 |
|---|---:|---|
| Node.js | 22 | Expo 与 JavaScript 依赖 |
| JDK | 21，且包含 `javac` | Android/Java 编译 |
| Android SDK | API 36 | Android 编译平台 |
| Android Build Tools | 36.0.0 | APK 打包 |
| Android NDK | 27.1.12297006 | React Native 原生编译 |
| Android Platform Tools | 最新 | 通过 `adb` 安装测试 APK |

Android Studio 可直接安装上述 Android SDK 组件。安装后设置 SDK 路径，例如：

```bash
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
export JAVA_HOME="/path/to/jdk-21"
```

## 构建

在 `mobile/` 目录执行：

```bash
chmod +x scripts/build-android-debug.sh
./scripts/build-android-debug.sh
```

成功后的 APK 路径为：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

将 APK 传到 Android 设备后允许“安装未知应用”，或使用 USB 调试安装：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

> 该应用采用设备本地模式。个人 Finnhub API Key、虚拟账户、自选和交易记录只存储在当前设备；所有交易均为虚拟资金，非真实交易。

## 沙箱构建记录

本项目已在受限构建环境中成功完成 Android SDK、NDK、CMake 和完整 JDK 配置，Gradle 也能进入 Android/Expo 模块配置与 Java 编译阶段。但后续 React Native 原生 CMake 编译期间的 Gradle JVM 会被环境终止，未能生成 APK。该情况不影响上述无账号本机构建流程；建议在内存更充足的本地电脑执行脚本。

