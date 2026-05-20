import { StorageService } from "@/utils/storeUtils";
import axios from "axios";
import qs from "qs";
import { payloadResponse, userInput } from "./loginInterfaces";
import { fetchUserProfile } from "@/data/auth/userProfile";

export const loginAsync = async (userData: userInput) => {
  let url = `${import.meta.env.VITE_BACKEND_URL}oauth2/access_token`;
  const options = {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: qs.stringify({
      client_id: import.meta.env.VITE_APP_CLIENT_ID,
      client_secret: import.meta.env.VITE_APP_CLIENT_SECRET,
      grant_type: "password",
      username: userData.username,
      password: userData.password,
    }),
    url,
  };

  let errorStatus: payloadResponse = {
    error: "",
    status: true,
  };

  try {
    const response = await axios(options);

    if (response.status === 200) {
      let storageService = new StorageService();
      storageService.setItem("access_token", response.data.access_token);
      storageService.setItem("refresh_token", response.data.refresh_token);
      storageService.setItem("expires_in", response.data.expires_in);

      let expireTime = new Date();
      expireTime.setSeconds(expireTime.getSeconds() + response.data.expires_in);
      storageService.setItem("expireTime", expireTime.getTime());

      errorStatus = await fetchUserProfile();
    }
  } catch (error: any) {
    if (error?.response?.data?.error === "invalid_grant") {
      errorStatus = {
        status: true,
        error: "invalid credentials provided",
      };
    }

    if (error?.code == "ERR_NETWORK") {
      errorStatus = {
        status: true,
        error:
          "Error Could Not Fetch check your internet Connection or Contact Your System Admin",
      };
    }
  }
  return errorStatus;
};
