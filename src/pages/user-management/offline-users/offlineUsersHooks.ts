import axios from "axios";
import { OfflineUser } from "./offlineUsersTypes";

export const getOfflineUsers = async (): Promise<OfflineUser[]> => {

  let url = `${import.meta.env.VITE_APP_OFFLINE_URL}api/User/allUsers`;

  const options = {
    method: "GET",
    headers: { "content-type": "application/json" },
    url,
  };

  try {
    const fetchUsers = await axios<OfflineUser[]>(options);
    return fetchUsers.data;
  } catch (error) {
    console.error(error);
    return [];
  }
};
