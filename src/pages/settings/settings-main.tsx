import { Outlet, useLocation } from "react-router-dom";
import { CardLayout } from "../../components/layout/card-layout";
import { settingsNavs } from "./settings-navs";

export function SettingsMain() {
  const location = useLocation();

  return (
    <>
      {location.pathname.replace("main", "").replaceAll("/", "") ==
      "settings" ? (
        <CardLayout navs={settingsNavs} />
      ) : (
        <Outlet></Outlet>
      )}
    </>
  );
}
