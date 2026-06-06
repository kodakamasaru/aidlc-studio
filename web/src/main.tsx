// Browser entry — mounts React under BrowserRouter with the project + topbar
// providers, and loads global styles (which @import the tokens).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ProjectProvider } from "./lib/project-context";
import { TopbarProvider } from "./components/shell/topbar-context";
import "./styles/global.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <ProjectProvider>
        <TopbarProvider>
          <App />
        </TopbarProvider>
      </ProjectProvider>
    </BrowserRouter>
  </StrictMode>,
);
