import { RouteInterface } from "../../interfaces/SharedInterfaces";
import { OfflineUsers } from "./offline-users/OfflineUsersMain";
import { UsersList } from "./user-list/userListMain";
import { UserManagementMain } from "./UserManagementMain";

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