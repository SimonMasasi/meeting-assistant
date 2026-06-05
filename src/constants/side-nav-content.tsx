import { Person, Settings , Dashboard, Groups } from "@mui/icons-material"
import { SideNavInterface } from "../interfaces/shared-interfaces"

export const sideNavContent:SideNavInterface[] = [
    {
        title: "Dashboard",
        to:"dashboard",
        icon: <Dashboard className="text-primary-500"/>
    },
    {
        title: "Meetings",
        to:"meetings",
        icon: <Groups className="text-primary-500"/>
    },
    {
        title: "Settings",
        to:"settings",
        icon: <Settings className="text-primary-500"/>
    },
    {
        title: "User Management",
        to:"user-management",
        icon: <Person className="text-primary-500"/>
    }
]