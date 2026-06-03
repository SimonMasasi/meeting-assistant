import { cardLayoutProps } from "@/interfaces/shared-interfaces";
import { Person } from "@mui/icons-material";
import PersonOffIcon from '@mui/icons-material/PersonOff';


export const userManagementNavs:cardLayoutProps[] = [
    {
        name:"Users",
        to:"users",
        icon:<Person/>
    },
    {
        name:"Offline Users",
        to:"offline-users",
        icon:<PersonOffIcon/>
    }
    
]