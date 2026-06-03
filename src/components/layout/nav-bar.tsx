import { showSideBar } from "@/atoms/shared-atoms";
import { useAtom } from "jotai";
import { useLocation } from "react-router-dom";
import { ProfileBar } from "./profile-bar";

export function Navbar() {
  const location = useLocation();
  const [sideBar, setSideBar] = useAtom(showSideBar);


  return (
    <nav className="relative flex flex-wrap items-center justify-between px-0 py-2 mx-6 transition-all ease-in shadow-none duration-250 rounded-2xl lg:flex-nowrap lg:justify-start  ">
      <div className="flex items-center justify-between w-full px-4 py-1 mx-auto flex-wrap-inherit">
        <nav>
          <ol className="flex flex-wrap pt-1 mr-12 bg-transparent rounded-lg sm:mr-16">
            <li className="text-sm leading-normal">
              <a className="text-gray-800 ">Pages</a>
            </li>
            <li
              className="text-sm pl-2 capitalize leading-normal text-gray-500 before:float-left before:pr-2 before:text-gray before:content-['/']"
              aria-current="page"
            >
              {location.pathname.replace("/", " ").replaceAll("-", " ")}
            </li>
          </ol>
        </nav>
        <div className="flex items-center mt-2 grow sm:mt-0 sm:mr-6 md:mr-0 lg:flex lg:basis-auto">
          <div className="flex items-center md:ml-auto md:pr-4">
            <div className="relative flex flex-wrap items-stretch w-full transition-all rounded-lg ease">
              <span className="text-sm ease leading-5.6 absolute z-50 -ml-px flex h-full items-center whitespace-nowrap rounded-lg rounded-tr-none rounded-br-none border border-r-0 border-transparent bg-transparent py-2 px-2.5 text-center font-normal text-slate-500 transition-all">
                <i className="fas fa-search"></i>
              </span>

            </div>
          </div>
          <ul className="flex flex-row justify-end pl-0 mb-0 list-none md-max:w-full">
            <li className="flex items-center">
              <ProfileBar/>
            </li>
            <li className="flex items-center pl-4" >
              <a href="#" className="block p-0 text-sm  transition-all" onClick={()=>setSideBar(!sideBar)}>
                <div className="w-6 mt-1">
                  <i className="ease mb-1 relative block h-0.5 rounded-sm bg-gray-500 transition-all"></i>
                  <i className="ease mb-1 relative block h-0.5 rounded-sm bg-gray-500  transition-all"></i>
                  <i className="ease mb-1 relative block h-0.5 rounded-sm bg-gray-500  transition-all"></i>
                </div>
              </a>
            </li>
            <li className="flex items-center px-4">
              <a href="#" className="p-0 text-sm text-black transition-all">
                <i className="cursor-pointer fa fa-cog"></i>
                {/* <!-- fixed-plugin-button-nav  --> */}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
