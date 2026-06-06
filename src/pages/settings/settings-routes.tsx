import { RouteInterface } from "../../interfaces/shared-interfaces";
import { MailSettings } from "./mail/mail-settings";
import { SettingsMain } from "./settings-main";
import { StorageSettings } from "./storage/storage-settings";

export const settingsRoutes: RouteInterface[] = [
  {
    path: "settings",
    element: <SettingsMain/>,
    children: [
      {
        path: "mail",
        element: <MailSettings/>,
      },
      {
        path: "storage",
        element: <StorageSettings/>,
      },
    ],
  },
];
