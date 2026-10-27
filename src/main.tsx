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
      getMany: (keys: string[]) => Promise<Record<string,string|null>>;
    };
    Tesseract?: any;
  }
}

window.storage = storage;

// iPhone Safari等はしばらく使わないとサイトデータを削除することがある。永続化を要求して消失リスクを下げる。
// 許可されるかはブラウザ次第（失敗しても動作に影響なし）。
try { void navigator.storage?.persist?.(); } catch { /* ignore */ }

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NARPredictionTool />
  </React.StrictMode>,
);
