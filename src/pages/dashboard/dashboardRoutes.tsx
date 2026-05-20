import { RouteInterface } from "../../interfaces/SharedInterfaces";
import { DashboardMain } from "./dashboard";

export const dashboardRoutes: RouteInterface[] = [
    { 
      path: "dashboard",
      element: <DashboardMain/>
    }
  ]