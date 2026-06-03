import { showSideBar } from "@/atoms/shared-atoms";
import { Settings } from "@mui/icons-material";
import { useAtom } from "jotai";
import { useLocation } from "react-router-dom";
import { ProfileBar } from "./profile-bar";

export function Navbar() {
  const location = useLocation();
  const [sideBar, setSideBar] = useAtom(showSideBar);

  const breadcrumb = location.pathname
    .replace("/", "")
    .replaceAll("-", " ")
    .replaceAll("/", " / ");

  return (
    <nav
      aria-label="Top navigation"
      className="relative flex flex-wrap items-center justify-between px-0 py-2 mx-6 transition-all ease-in shadow-none duration-250 rounded-2xl lg:flex-nowrap lg:justify-start"
    >
      <div className="flex items-center justify-between w-full px-4 py-1 mx-auto flex-wrap-inherit">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap pt-1 mr-12 bg-transparent rounded-lg sm:mr-16">
            <li className="text-sm leading-normal">
              <span className="text-gray-800">Pages</span>
            </li>
            <li
              className="text-sm pl-2 capitalize leading-normal text-gray-500 before:float-left before:pr-2 before:text-gray-400 before:content-['/']"
              aria-current="page"
            >
              {breadcrumb}
            </li>
          </ol>
        </nav>

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
                <span className="block h-0.5 w-full rounded-sm bg-gray-500 transition-all" />
                <span className="block h-0.5 w-full rounded-sm bg-gray-500 transition-all" />
                <span className="block h-0.5 w-full rounded-sm bg-gray-500 transition-all" />
              </button>
            </li>
            <li className="flex items-center px-2">
              <button
                type="button"
                aria-label="Settings"
                className="p-1 text-slate-600 transition-all rounded hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
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
