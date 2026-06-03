import { RouteInterface } from "../../interfaces/shared-interfaces";
import { OfflineUsers } from "./offline-users/offline-users-main";
import { UsersList } from "./user-list/user-list-main";
import { UserManagementMain } from "./user-management-main";

export const userManagementRoutes: RouteInterface[] = [
  {
    path: "user-management",
    element: <UserManagementMain/>,
    children: [
        {
          path:'users',
          element:<UsersList/>
        },
        {
          path:'offline-users',
          element:<OfflineUsers/>
        }
    ]
  },
];