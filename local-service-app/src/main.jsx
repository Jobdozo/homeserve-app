import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import App from "./App.jsx";
import UpdateGate from "./components/UpdateGate.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HelmetProvider>
      <UpdateGate>
        <App />
      </UpdateGate>
    </HelmetProvider>
  </StrictMode>
);
