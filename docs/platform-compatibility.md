# 跨端应用与 HarmonyOS NEXT 适配结论

本项目的首发目标为 iOS 与 Android。React Native 适合作为共享 UI、业务逻辑和网络层的跨端基础；真实行情、企业公开资料、模拟资产与学习型咨询应由统一后端提供，避免将核心业务绑定到某一个移动操作系统。

HarmonyOS NEXT 不能直接运行 Android 或 iOS 原生构建产物，因此不应将 Android 安装包视为鸿蒙版本。React Native OpenHarmony（RNOH）提供了将 React Native 应用运行于 OpenHarmony 设备的路径；公开资料显示，其目前支持特定 React Native 版本，并依赖新架构、DevEco Studio 与 ArkTS/原生桥接能力。Expo 的公开讨论尚未给出 HarmonyOS NEXT 的官方构建支持承诺。

因此，实施方案为：首发 iOS/Android 使用 React Native 应用与统一服务端；适配时保留平台能力抽象层，避免依赖未移植的原生模块；HarmonyOS NEXT 作为独立构建与测试阶段，采用 RNOH/ArkTS 桥接进行验证。此路径可最大化复用核心逻辑，但不能承诺与 iOS/Android 同步发布。

## 参考来源

1. [Huawei x Software Mansion: Bringing React Native Support to HarmonyOS NEXT](https://swmansion.com/blog/huawei-x-software-mansion-bringing-react-native-support-to-harmonyos-next-82e02bd75549/)
2. [Expo Issue #33303: HarmonyOS NEXT support question](https://github.com/expo/expo/issues/33303)
