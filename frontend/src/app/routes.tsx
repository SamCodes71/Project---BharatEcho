import { createBrowserRouter } from "react-router";
import { DashboardLayout } from "./components/dashboard-layout";
import { Overview }     from "./pages/overview";
import { Complaints }   from "./pages/complaints";
import { Calls }        from "./pages/calls";
import { Surveys }      from "./pages/surveys";
import { Feedback }     from "./pages/feedback";
import { Analytics }    from "./pages/analytics";
import { Notifications } from "./pages/notifications";
import { Settings }     from "./pages/settings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: DashboardLayout,
    children: [
      { index: true,                 Component: Overview },
      { path: "complaints",          Component: Complaints },
      { path: "calls",               Component: Calls },
      { path: "surveys",             Component: Surveys },
      { path: "feedback",            Component: Feedback },
      { path: "analytics",           Component: Analytics },
      { path: "notifications",       Component: Notifications },
      { path: "settings",            Component: Settings },
    ],
  },
]);
