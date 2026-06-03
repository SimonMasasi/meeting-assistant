import { Outlet, useLocation } from "react-router-dom";
import { CardLayout } from "../../components/layout/card-layout";
import { userManagementNavs } from "./user-management-navs";

export function UserManagementMain() {
  const location = useLocation();

  return (
    <>
      {location.pathname.replace("main", "").replaceAll("/", "") ==
      "user-management" ? (
        <CardLayout cards={userManagementNavs} />
      ) : (
        <Outlet></Outlet>
      )}
    </>
  );
}