import { showSideBar, themeAtom } from "@/atoms/shared-atoms";
import { ArrowBack, DarkMode, LightMode, Settings } from "@mui/icons-material";
import { useAtom } from "jotai";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ProfileBar } from "./profile-bar";

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sideBar, setSideBar] = useAtom(showSideBar);
  const [theme, setTheme] = useAtom(themeAtom);

  const isDark = theme === "dark";

  // Hide on the dashboard "home" (login pushes it onto the login route, so a
  // raw back would drop the user on the login screen) and when there's no
  // in-app history to go back to (idx 0 is the first history entry).
  const isDashboard = location.pathname === "/main/dashboard";
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  const showBack = canGoBack && !isDashboard;

  // Build a clickable trail from the path. Each crumb links to its cumulative
  // path; "main" is a route prefix with no page of its own, so it points at the
  // dashboard. The last crumb is the current page and isn't a link.
  const crumbs = location.pathname
    .split("/")
    .filter(Boolean)
    .map((segment, index, all) => ({
      label: segment.replaceAll("-", " "),
      to:
        segment === "main"
          ? "/main/dashboard"
          : "/" + all.slice(0, index + 1).join("/"),
      isLast: index === all.length - 1,
    }));

  return (
    <nav
      aria-label="Top navigation"
      className="sticky top-0 z-10 flex flex-wrap items-center justify-between px-0 py-2 mx-6 transition-all ease-in shadow-none duration-250 rounded-2xl lg:flex-nowrap lg:justify-start bg-gray-50 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between w-full px-4 py-1 mx-auto flex-wrap-inherit">
        <div className="flex items-center">
          {showBack && (
            <button
              type="button"
              aria-label="Go back"
              title="Go back"
              onClick={() => navigate(-1)}
              className="mr-3 p-1 text-slate-600 transition-all rounded hover:text-primary-600 dark:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <ArrowBack fontSize="small" />
            </button>
          )}

          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap pt-1 mr-12 bg-transparent rounded-lg sm:mr-16">
              <li className="text-sm leading-normal">
                <Link
                  to="/main/dashboard"
                  className="text-gray-800 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  Pages
                </Link>
              </li>
              {crumbs.map((crumb, index) => (
                <li
                  key={index}
                  className="text-sm pl-2 capitalize leading-normal text-gray-500 dark:text-slate-400 before:float-left before:pr-2 before:text-gray-400 dark:before:text-slate-500 before:content-['/']"
                  aria-current={crumb.isLast ? "page" : undefined}
                >
                  {crumb.isLast ? (
                    <span>{crumb.label}</span>
                  ) : (
                    <Link
                      to={crumb.to}
                      className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Action buttons */}
        <div className="flex items-center mt-2 grow sm:mt-0 sm:mr-6 md:mr-0 lg:flex lg:basis-auto">
          <ul className="flex flex-row items-center justify-end pl-0 mb-0 list-none gap-1 md-max:w-full w-full">
            <li className="flex items-center ml-auto">
              <button
                type="button"
                aria-label="Toggle sidebar"
                aria-expanded={sideBar}
                onClick={() => setSideBar(!sideBar)}
                className="flex flex-col justify-center gap-1 w-6 h-6 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <span className="block h-0.5 w-full rounded-sm bg-gray-500 dark:bg-slate-400 transition-all" />
                <span className="block h-0.5 w-full rounded-sm bg-gray-500 dark:bg-slate-400 transition-all" />
                <span className="block h-0.5 w-full rounded-sm bg-gray-500 dark:bg-slate-400 transition-all" />
              </button>
            </li>
            <li className="flex items-center px-2">
              <button
                type="button"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                aria-pressed={isDark}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="p-1 text-slate-600 transition-all rounded hover:text-primary-600 dark:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {isDark ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
              </button>
            </li>
            <li className="flex items-center px-2">
              <button
                type="button"
                aria-label="Settings"
                className="p-1 text-slate-600 transition-all rounded hover:text-primary-600 dark:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <Settings fontSize="small" />
              </button>
            </li>
            <li className="flex items-center pl-2 flex-shrink-0">
              <ProfileBar />
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
