import SecureLS from "secure-ls";

type SecureLSInstance = {
  set: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
  remove: (key: string) => void;
  removeAll: () => void;
};

type SecureLSConstructor = new (options: {
  encodingType: "aes";
  isCompression: boolean;
  encryptionSecret: string;
}) => SecureLSInstance;

const SecureLSConstructor =
  (SecureLS as unknown as { default?: SecureLSConstructor }).default ??
  (SecureLS as unknown as SecureLSConstructor);

const ls = new SecureLSConstructor({
  encodingType: "aes",
  isCompression: false,
  encryptionSecret: import.meta.env.VITE_APP_STR_PWD ?? "",
});
export class StorageService {
  setItem(storeKey: string, storeValue: any) {
    ls.set(storeKey, storeValue);
  }

  getItem(key: string) {
    return ls.get(key);
  }

  removeItem(key: string) {
    ls.remove(key);
  }

  clearStorage() {
    ls.removeAll();
  }
}
