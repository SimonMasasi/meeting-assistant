import { RouteInterface } from "../../interfaces/shared-interfaces";
import { MailSettings } from "./mail/mail-settings";
import { SettingsMain } from "./settings-main";
import { SmsSettings } from "./sms/sms-settings";

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
        path: "sms",
        element: <SmsSettings/>,
      },
    ],
  },
];
