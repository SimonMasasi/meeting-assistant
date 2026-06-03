import { NavLink } from "react-router-dom";
import { sideNavContent } from "../../constants/side-nav-content";
import { useAtom } from "jotai";
import { showSideBar } from "@/atoms/shared-atoms";

export function SideBar() {
  const [sideBar, setSideBar] = useAtom(showSideBar);

  return (
    <aside
      className={
        sideBar
          ? "fixed inset-y-0 flex-wrap items-center justify-between block w-full p-0 my-4 overflow-y-auto antialiased transition-transform duration-200 -translate-x-full bg-white border-0 shadow-xl   max-w-64 ease-nav-brand z-990 xl:ml-6 rounded-2xl xl:left-0 xl:translate-x-0"
          : "fixed inset-y-0 flex-wrap items-center justify-between block w-full p-0 my-4 overflow-y-auto antialiased transition-transform duration-200  bg-white border-0 shadow-xl   max-w-64 ease-nav-brand z-990 xl:ml-6 rounded-2xl xl:left-0 xl:translate-x-0"
      }
    >
      <div className="h-19">
        <i className="absolute top-0 right-0 p-4 opacity-50 cursor-pointer fas fa-times text-slate-400 xl:hidden"></i>
        <NavLink
          className="block px-8 py-6 m-0 text-sm whitespace-nowrap  text-slate-700"
          to="dashboard"
        >
          <img
            src="/src/assets/images/file.png"
            className="inline h-full max-w-full transition-all duration-200  ease-nav-brand max-h-8"
            alt="main_logo"
          />
          <span className="ml-1 font-semibold transition-all duration-200 ease-nav-brand">
            {import.meta.env.VITE_APP_TITLE ?? "My App"}
          </span>
        </NavLink>
      </div>

      <hr className="h-px mt-0 bg-transparent bg-gradient-to-r from-transparent via-black/40 to-transparent" />

      <div className="items-center block w-auto max-h-screen overflow-auto h-[75%] grow basis-full">
        <ul className="flex flex-col pl-0 mb-0">
          {sideNavContent.map((nav, key) => {
            return (
              <div key={key}>
                <li className="w-full my-2">
                  <NavLink
                    onClick={() => setSideBar(!sideBar)}
                    to={nav.to}
                    className={({ isActive, isPending }) =>
                      isActive
                        ? "py-2.7 bg-blue-500/13 text-sm ease-nav-brand my-0 mx-2 flex items-center whitespace-nowrap rounded-lg px-4 font-semibold text-slate-700 transition-colors"
                        : isPending
                        ? "py-2.7 text-sm ease-nav-brand my-0 mx-2 flex items-center whitespace-nowrap rounded-lg px-4 font-semibold text-slate-700 transition-colors"
                        : "py-2.7  text-sm ease-nav-brand my-0 mx-2 flex items-center whitespace-nowrap rounded-lg px-4 font-semibold text-slate-700 transition-colors"
                    }
                  >
                    <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg bg-center stroke-0 text-center xl:p-2.5">
                      {nav?.icon}
                    </div>
                    <span className="ml-1 duration-300 opacity-100 pointer-events-none ease">
                      {nav?.title}
                    </span>
                  </NavLink>
                </li>
              </div>
            );
          })}
        </ul>
      </div>

      <div className="mx-4"></div>
    </aside>
  );
}
