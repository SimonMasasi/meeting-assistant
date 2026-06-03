import { RouteInterface } from "../../interfaces/shared-interfaces";
import { AuthMain } from "./auth-main";
import { LoginMain } from "./login/login-main";

export const authRoutes: RouteInterface[] = [
  {
    path: "auth",
    element: <AuthMain />,
    children: [
      {
        path: "login",
        element: <LoginMain />,
      },

    ],
  },
]; 