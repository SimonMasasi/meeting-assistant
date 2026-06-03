import { Outlet } from "react-router-dom";
import { redirect } from "react-router-dom";
import {useEffect } from 'react';



export function AuthMain(){
    useEffect(()=>{
        return function navigateUser(){
             redirect("/auth/login")
        }
    })

    return(
        <>
        <Outlet/>
        </>
    )
}