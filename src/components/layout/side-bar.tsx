import { Close } from "@mui/icons-material";
import { useAtom } from "jotai";
import { NavLink } from "react-router-dom";
import { showSideBar } from "@/atoms/shared-atoms";
import { sideNavContent } from "../../constants/side-nav-content";
import emblem from "../../assets/images/meeting.webp"

export function SideBar() {
  const [sideBar, setSideBar] = useAtom(showSideBar);

  return (
    <aside
      aria-label="Main navigation"
      className={
        sideBar
          ? "fixed inset-y-0 flex-wrap items-center justify-between block w-full p-0 my-4 overflow-y-auto antialiased transition-transform duration-200 bg-white border-0 shadow-xl max-w-64 z-[990] xl:ml-6 rounded-2xl xl:left-0 xl:translate-x-0"
          : "fixed inset-y-0 flex-wrap items-center justify-between block w-full p-0 my-4 overflow-y-auto antialiased transition-transform duration-200 -translate-x-full bg-white border-0 shadow-xl max-w-64 z-[990] xl:ml-6 rounded-2xl xl:left-0 xl:translate-x-0"
      }
    >
      <div className="relative h-20">
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSideBar(false)}
          className="absolute top-0 right-0 p-4 text-slate-400 opacity-50 xl:hidden hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
        >
          <Close fontSize="small" />
        </button>
        <NavLink
          className="block px-8 py-6 m-0 text-sm whitespace-nowrap text-slate-700"
          to="/dashboard"
        >
          <img
            src={emblem}
            className="inline h-full max-w-full transition-all duration-200 max-h-8"
            alt="main_logo"
          />
          <span className="ml-1 font-semibold transition-all duration-200">
            {import.meta.env.VITE_APP_TITLE ?? "My App"}
          </span>
        </NavLink>
      </div>

      <hr className="h-px mt-0 bg-transparent bg-gradient-to-r from-transparent via-black/40 to-transparent" />

      <div className="items-center block w-auto max-h-screen overflow-auto h-[75%] grow basis-full">
        <ul className="flex flex-col pl-0 mb-0 pb-4">
          {sideNavContent.map((nav, key) => (
            <li key={key} className="w-full my-2">
              <NavLink
                onClick={() => setSideBar(false)}
                to={nav.to}
                className={({ isActive, isPending }) =>
                  isActive
                    ? "py-2.5 text-sm my-0 mx-2 flex items-center whitespace-nowrap rounded-lg px-4 font-semibold text-primary-600 transition-colors bg-primary-500/20"
                    : isPending
                    ? "py-2.5 text-sm my-0 mx-2 flex items-center whitespace-nowrap rounded-lg px-4 font-semibold text-slate-400 transition-colors opacity-60"
                    : "py-2.5 text-sm my-0 mx-2 flex items-center whitespace-nowrap rounded-lg px-4 font-semibold text-slate-700 transition-colors hover:bg-gray-100"
                }
              >
                <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg text-center xl:p-2.5">
                  {nav?.icon}
                </div>
                <span className="ml-1 duration-300 opacity-100 pointer-events-none">
                  {nav?.title}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
