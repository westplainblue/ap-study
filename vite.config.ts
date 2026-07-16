import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" — GitHub Pages 等のサブパス配信でも動くよう相対パスにする
export default defineConfig({
  plugins: [react()],
  base: "./",
});
