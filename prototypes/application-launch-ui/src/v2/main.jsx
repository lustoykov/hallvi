import React from "react";
import { createRoot } from "react-dom/client";
import "../catalog/catalog.css";
import "./journey-v2.css";
import { JourneyV2Prototype } from "./JourneyV2Prototype.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <JourneyV2Prototype />
  </React.StrictMode>,
);
