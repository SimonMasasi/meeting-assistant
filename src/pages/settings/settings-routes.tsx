import { RouteInterface } from "../../interfaces/shared-interfaces";
import { AiSettings } from "./ai/ai-settings";
import { MailSettings } from "./mail/mail-settings";
import { SettingsMain } from "./settings-main";
import { StorageSettings } from "./storage/storage-settings";

export const settingsRoutes: RouteInterface[] = [
  {
    path: "settings",
    element: <SettingsMain/>,
    children: [
      {
        path: "ai",
        element: <AiSettings/>,
      },
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
