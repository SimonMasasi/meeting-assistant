import { Mail } from "@mui/icons-material";
import { Folder } from "@mui/icons-material";
import { SmartToy } from "@mui/icons-material";
import { cardLayoutProps } from "../../interfaces/shared-interfaces";

export const settingsNavs:cardLayoutProps[] = [

    {
        name:"AI Settings",
        icon:<SmartToy></SmartToy>,
        to:"ai"
    },
    {
        name:"Mail Settings",
        icon:<Mail></Mail>,
        to:"mail"
    },
    {
        name:"Storage Settings",
        icon:<Folder></Folder>,
        to:"storage"
    }

]