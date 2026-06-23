import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "./components/layout/main-layout";
import { settingsRoutes } from "./pages/settings/settings-routes";
import ErrorPage from "./components/layout/error-layout";
import { LoginMain } from "./pages/auth/login/login-main";
import { authRoutes } from "./pages/auth/auth-routes";
import { dashboardRoutes } from "./pages/dashboard/dashboard-routes";
import { meetingsRoutes } from "./pages/meetings/meetings-routes";
import { ModeSelectMain } from "./pages/mode-select/mode-select-main";
import { RequireAccess, RootRedirect } from "./components/routing/route-gates";


export const baseRouter = createBrowserRouter([
    {
        // Landing: decide between mode-select / login / app from mode + session.
        path: "",
        element:<RootRedirect/>,
    },
    {
        path: "mode-select",
        element:<ModeSelectMain/>,
    },
    {
        path: "login",
        element:<LoginMain/>,
    },
    {
        path: "main",
        element:(
            <RequireAccess>
                <MainLayout/>
            </RequireAccess>
        ),
        errorElement:<ErrorPage/>,
        children:[
            ...settingsRoutes,
            ...authRoutes,
            ...dashboardRoutes,
            ...meetingsRoutes
        ]
    }
])
