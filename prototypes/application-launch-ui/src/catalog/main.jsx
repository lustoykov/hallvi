import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogPrototype } from "./CatalogPrototype.jsx";
import "./catalog.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CatalogPrototype />
  </React.StrictMode>,
);
