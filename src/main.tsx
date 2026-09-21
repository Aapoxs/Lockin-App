import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import globalStylesheetUrl from "./styles/global.css?url";

const globalStylesheet = document.createElement("link");
globalStylesheet.rel = "stylesheet";
globalStylesheet.href = import.meta.env.DEV
  ? `${globalStylesheetUrl}?direct`
  : globalStylesheetUrl;
document.head.append(globalStylesheet);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/service-worker.js");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
