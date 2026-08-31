import React from "react";
import { createRoot } from "react-dom/client";
import { JourneyOnePrototype } from "./JourneyOnePrototype.jsx";
import "./journey-one.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <JourneyOnePrototype />
  </React.StrictMode>,
);
