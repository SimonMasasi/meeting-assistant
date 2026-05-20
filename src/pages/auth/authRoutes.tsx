import { RouteInterface } from "../../interfaces/SharedInterfaces";
import { AuthMain } from "./Authmain";
import { LoginMain } from "./login/loginMain";

export const authRoutes: RouteInterface[] = [
  {
    path: "auth",
    element: <AuthMain />,
    children: [
      {
        path: "login",
        element: <LoginMain />,
      },
      {
        path: "register",
        element: <LoginMain />,
      },
      {
        path: "signup",
        element: <LoginMain />,
      },
    ],
  },
];