import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, theme } from "./lib/ui";
import "./styles/global.css";

// 配色は最初の描画より前に当てる(Reactのマウント後だと一瞬ライトが見えてしまう)
applyTheme(theme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
