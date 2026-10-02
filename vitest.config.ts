import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: [
      { find: /^react$/, replacement: path.resolve(templateRoot, "node_modules", "react") },
      { find: /^@expo\/vector-icons\/MaterialCommunityIcons$/, replacement: path.resolve(templateRoot, "server", "test", "materialCommunityIconsMock.ts") },
      { find: "@", replacement: path.resolve(templateRoot, "client", "src") },
      { find: "@shared", replacement: path.resolve(templateRoot, "shared") },
      { find: "@assets", replacement: path.resolve(templateRoot, "attached_assets") },
      { find: "react-native", replacement: path.resolve(templateRoot, "server", "test", "reactNativeMock.ts") },
      { find: "react-native-svg", replacement: path.resolve(templateRoot, "server", "test", "nativeVisualMocks.ts") },
      { find: "@expo/vector-icons", replacement: path.resolve(templateRoot, "server", "test", "nativeVisualMocks.ts") },
      { find: "expo-status-bar", replacement: path.resolve(templateRoot, "server", "test", "nativeVisualMocks.ts") },
      { find: "@react-native-async-storage/async-storage", replacement: path.resolve(templateRoot, "server", "test", "asyncStorageMock.ts") },
      { find: "expo-secure-store", replacement: path.resolve(templateRoot, "server", "test", "secureStoreMock.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
  },
});
