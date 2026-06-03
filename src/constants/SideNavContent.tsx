import { Person, Settings } from "@mui/icons-material"
import { SideNavInterface } from "../interfaces/SharedInterfaces"

export const sideNavContent:SideNavInterface[] = [
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