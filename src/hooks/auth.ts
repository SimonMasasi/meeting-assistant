import { useEffect } from "react";


export const useAuth = () => {
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
    }
  }, []);
}


export const useLogin = () => {
  const login = (token: string) => {
    localStorage.setItem("token", token);
    window.location.href = "/";
  };

  return { login };
}