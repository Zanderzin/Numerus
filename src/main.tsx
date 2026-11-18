import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FinancasProvider } from "./lib/financas";
import "./styles/base.css";

// dev console helpers: numerus.seed() / numerus.limpar(). stripped from production builds.
if (import.meta.env.DEV) {
  import("./dev/seed").then(({ aplicarSeed, limparSeed }) => {
    Object.assign(window, {
      numerus: {
        seed: () => (console.table(aplicarSeed()), location.reload()),
        limpar: () => (limparSeed(), location.reload()),
      },
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <FinancasProvider>
        <App />
      </FinancasProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
