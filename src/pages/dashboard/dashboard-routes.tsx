import { RouteInterface } from "../../interfaces/shared-interfaces";
import { DashboardMain } from "./dashboard-main";


export const dashboardRoutes: RouteInterface[] = [
  {
    path: "dashboard",
    element: <DashboardMain/>,

  },
];
