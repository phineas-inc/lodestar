import { createHashRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Briefing } from "./pages/Briefing";
import { ThreatMap } from "./pages/ThreatMap";
import { Reports } from "./pages/Reports";
import { Receiver } from "./pages/Receiver";

// Hash routing: works on any static host with no server rewrite rules.
export const router = createHashRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Briefing },
      { path: "map", Component: ThreatMap },
      { path: "reports", Component: Reports },
      { path: "receiver", Component: Receiver },
    ],
  },
]);
