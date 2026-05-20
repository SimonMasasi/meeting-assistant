/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_BACKEND_GRAPHQL_URL: string;
  readonly VITE_BACKEND_URL: string;
  readonly VITE_APP_CLIENT_ID: string;
  readonly VITE_APP_CLIENT_SECRET: string;
  readonly VITE_APP_STR_PWD: string;
  readonly VITE_APP_OFFLINE_URL:string;
}
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  