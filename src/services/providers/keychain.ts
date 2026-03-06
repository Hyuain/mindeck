import { invoke } from "@tauri-apps/api/core";

/** Store an API key in the OS keychain under the given alias. */
export async function setApiKey(alias: string, key: string): Promise<void> {
  await invoke("set_api_key", { alias, key });
}

/** Retrieve an API key from the OS keychain. Throws if not found. */
export async function getApiKey(alias: string): Promise<string> {
  return invoke<string>("get_api_key", { alias });
}

/** Remove an API key from the OS keychain. */
export async function deleteApiKey(alias: string): Promise<void> {
  await invoke("delete_api_key", { alias });
}
