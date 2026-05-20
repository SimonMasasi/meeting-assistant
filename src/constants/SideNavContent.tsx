import { Dashboard, Person, Settings } from "@mui/icons-material"
import { SideNavInterface } from "../interfaces/SharedInterfaces"

export const sideNavContent:SideNavInterface[] = [
    {
        title: "Dashboard",
        to:"dashboard",
        icon: <Dashboard className="text-blue-500"/>
    },
    {
        title: "Settings",
        to:"settings",
        icon: <Settings className="text-blue-500"/>
    },
    {
        title: "User Management",
        to:"user-management",
        icon: <Person className="text-blue-500"/>
    }
]