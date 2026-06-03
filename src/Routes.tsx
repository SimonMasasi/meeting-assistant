import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { settingsRoutes } from "./pages/settings/SettingsRoutes";
import ErrorPage from "./components/layout/ErrorLayout";
import { LoginMain } from "./pages/auth/login/login-main";
import { userManagementRoutes } from "./pages/user-management/UserManagementRoutes";
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