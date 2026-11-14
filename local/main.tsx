import React from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../components/Dashboard";
import "../app/globals.css";
import "../app/dimensional.css";
createRoot(document.getElementById("root")!).render(<Dashboard />);
