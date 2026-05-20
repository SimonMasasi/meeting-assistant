import { RouteInterface } from "../../interfaces/SharedInterfaces";
import { MailSettings } from "./mail/MailSettings";
import { SettingsMain } from "./SettingsMain";
import { SmsSettings } from "./sms/SmsSettings";

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
