import { GET_USER_PROFILE } from "@/graphql/auth.graphql";
import { graphqlClient } from "@/utils/ApolloClient";

import { StorageService } from "@/utils/storeUtils";

const storageService = new StorageService();

export async function fetchUserProfile() {
  try {
    const fetchUser = await graphqlClient.query({
      query: GET_USER_PROFILE,
    });
    let result = Object.values(fetchUser)[0];
    result = Object.values(result)[0];
    if (result?.response?.status) {
      let userProfile = result.data ? result.data?.getUserProfile?.data : {};
      storageService.removeItem("userProfile");
      storageService.setItem("userProfile", userProfile);

      return {
        status: false,
        error: "",
      };
    } else {
      return {
        status: true,
        error: `failed to fetch user profile reason ${result?.response?.message}`,
      };
    }
  } catch (error) {
    return {
      status: true,
      error: `failed to fetch user profile reason ${error}`,
    };
  }
}
