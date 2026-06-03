import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "./components/layout/main-layout";
import { settingsRoutes } from "./pages/settings/settings-routes";
import ErrorPage from "./components/layout/error-layout";
import { LoginMain } from "./pages/auth/login/login-main";
import { userManagementRoutes } from "./pages/user-management/user-management-routes";
import { authRoutes } from "./pages/auth/auth-routes";


export const baseRouter = createBrowserRouter([
    {
        path: "main",
        element:<MainLayout/>,
        errorElement:<ErrorPage/>,
        children:[
            ...settingsRoutes,
            ...userManagementRoutes,
            ...authRoutes
        ]
    },
    {
        path: "",
        element:<LoginMain/>,
    },
])