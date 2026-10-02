# 移动应用实施路径

本仓库保留为共享的服务端与数据层基线。移动端将采用 Expo/React Native 工程实现 iOS 与 Android 原生体验，通过统一的 API 契约访问用户资料、模拟账户、持仓、自选与研究数据。

HarmonyOS NEXT 不直接使用 Android 构建产物。后续通过 React Native OpenHarmony 或 ArkTS 原生桥接完成适配，首发 UI 不依赖无法移植的原生插件，并将图表、行情展示和学习咨询以跨平台组件及服务端 API 为主。
