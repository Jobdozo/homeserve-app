import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import UpdateGate from "./components/UpdateGate.jsx";
import { recoverFromStaleFiles } from "./utils/staleRecovery";

// Vite fires this when a lazily loaded screen's file is gone (a new version was
// deployed while this tab was open). Recover quietly instead of crashing.
window.addEventListener("vite:preloadError", (event) => {
  if (recoverFromStaleFiles()) event.preventDefault();
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <UpdateGate>
      <App />
    </UpdateGate>
  </StrictMode>
);
