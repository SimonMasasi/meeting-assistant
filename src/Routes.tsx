import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { settingsRoutes } from "./pages/settings/SettingsRoutes";
import ErrorPage from "./components/layout/ErrorLayout";
import { dashboardRoutes } from "./pages/dashboard/dashboardRoutes";
import { LoginMain } from "./pages/auth/login/loginMain";
import { userManagementRoutes } from "./pages/user-management/UserManagementRoutes";
import { authRoutes } from "./pages/auth/authRoutes";


export const baseRouter = createBrowserRouter([
    {
        path: "main",
        element:<MainLayout/>,
        errorElement:<ErrorPage/>,
        children:[
            ...settingsRoutes,
            ...dashboardRoutes,
            ...userManagementRoutes,
            ...authRoutes
        ]
    },
    {
        path: "",
        element:<LoginMain/>,
    },
])