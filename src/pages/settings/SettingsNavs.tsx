import { Sms } from "@mui/icons-material";
import { Mail } from "@mui/icons-material";
import { cardLayoutProps } from "../../interfaces/SharedInterfaces";

export const settingsNavs:cardLayoutProps[] = [
    {
        name:"Sms Settings",
        icon:<Sms></Sms>,
        to:"sms"
    },
    {
        name:"Mail Settings",
        icon:<Mail></Mail>,
        to:"mail"
    }

]