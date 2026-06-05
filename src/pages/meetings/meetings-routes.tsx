import { RouteInterface } from "../../interfaces/shared-interfaces";
import { MeetingsMain } from "./mettings-main";
import { MeetingDetailPage } from "./meeting-detail";

export const meetingsRoutes: RouteInterface[] = [
  {
    path: "meetings",
    element: <MeetingsMain />,
  },
  {
    path: "meeting/:id",
    element: <MeetingDetailPage />,
  },
];
