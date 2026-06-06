import { Mail } from "@mui/icons-material";
import { Folder } from "@mui/icons-material";
import { cardLayoutProps } from "../../interfaces/shared-interfaces";

export const settingsNavs:cardLayoutProps[] = [

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