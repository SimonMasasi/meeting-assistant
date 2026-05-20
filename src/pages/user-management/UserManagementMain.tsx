import { Outlet, useLocation } from "react-router-dom";
import { CardLayout } from "../../components/layout/CardLayout";
import { userManagementNavs } from "./UserManagementNavs";

export function UserManagementMain() {
  const location = useLocation();

  return (
    <>
      {location.pathname.replace("main", "").replaceAll("/", "") ==
      "user-management" ? (
        <CardLayout navs={userManagementNavs} />
      ) : (
        <Outlet></Outlet>
      )}
    </>
  );
}