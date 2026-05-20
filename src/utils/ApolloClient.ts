import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
// import { StorageService } from "./storeUtils";
import { setContext } from "@apollo/client/link/context";
import { StorageService } from "./storeUtils";

const storageService = new StorageService()

const httpLink = createHttpLink({
  uri: `${import.meta.env.VITE_BACKEND_GRAPHQL_URL}`,
});

// let storageService = new StorageService();

const authLink = setContext((_, { headers }) => {
  const authToken = storageService.getItem("access_token") ?? null;

  return {
    headers: {
      ...headers,
      authorization: authToken ? `Bearer ${authToken}` : "",
    },
  };
});

export const graphqlClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
