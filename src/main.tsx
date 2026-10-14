import React from "react";
import ReactDOM from "react-dom/client";
import NARPredictionTool from "./NARPredictionTool";
import "./index.css";
import { storage } from "./storage";

type StorageResult = { value: string | null };

declare global {
  interface Window {
    storage: {
      get: (key: string) => Promise<StorageResult>;
      set: (key: string, value: string) => Promise<void>;
      setMany: (values: Record<string,string>, expectedRevision?: number) => Promise<void>;
    };
    Tesseract?: any;
  }
}

window.storage = storage;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NARPredictionTool />
  </React.StrictMode>,
);
