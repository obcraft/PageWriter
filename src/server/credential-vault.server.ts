import { z } from "zod/v4";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ProviderSchema = z.enum(["openrouter", "openai", "anthropic"]);
export type Provider = z.infer<typeof ProviderSchema>;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesFromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
function base64FromBytes(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

export class VaultError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}

async function encryptionKey() {
  const value = process.env["API_KEY_ENCRYPTION_KEY"];
  if (!value) throw new VaultError("Encrypted key storage is not configured on this server.");
  try {
    const bytes = bytesFromBase64(value);
    if (bytes.length !== 32) throw new Error("Invalid key length");
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    throw new VaultError("Encrypted key storage is not configured on this server.");
  }
}

function context(userId: string, provider: Provider) {
  return encoder.encode("pagewright:user-api-key:v1:" + userId + ":" + provider);
}

export async function encryptApiKey(apiKey: string, userId: string, provider: Provider) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: context(userId, provider), tagLength: 128 },
    key,
    encoder.encode(apiKey),
  );
  return {
    ciphertext: base64FromBytes(new Uint8Array(ciphertext)),
    nonce: base64FromBytes(iv),
    encryption_version: 1,
  };
}

export async function decryptApiKey(
  row: { ciphertext: string; nonce: string; encryption_version: number },
  userId: string,
  provider: Provider,
) {
  const key = await encryptionKey();
  if (row.encryption_version !== 1)
    throw new VaultError("This saved API key uses an unsupported encryption version.");
  try {
    const result = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytesFromBase64(row.nonce),
        additionalData: context(userId, provider),
        tagLength: 128,
      },
      key,
      bytesFromBase64(row.ciphertext),
    );
    return decoder.decode(result);
  } catch {
    throw new VaultError("Your saved API key could not be decrypted. Save it again in Settings.");
  }
}

export async function saveUserCredential(userId: string, provider: Provider, apiKey: string) {
  const encrypted = await encryptApiKey(apiKey, userId, provider);
  const { error } = await supabaseAdmin.from("user_api_credentials").upsert(
    {
      user_id: userId,
      provider,
      ...encrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new VaultError("Couldn't save your encrypted API key. Please try again.");
}

export async function listUserCredentials(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_api_credentials")
    .select("provider,updated_at")
    .eq("user_id", userId);
  if (error) throw new VaultError("Couldn't load your saved API keys. Please try again.");
  return data;
}

export async function removeUserCredential(userId: string, provider: Provider) {
  const { error } = await supabaseAdmin
    .from("user_api_credentials")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new VaultError("Couldn't remove your saved API key. Please try again.");
}

export async function getUserCredential(userId: string, provider: Provider) {
  const { data, error } = await supabaseAdmin
    .from("user_api_credentials")
    .select("ciphertext,nonce,encryption_version")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new VaultError("Couldn't load your saved API key. Please try again.");
  if (!data) throw new VaultError("Add an API key for this provider in Settings.", 409);
  return decryptApiKey(data, userId, provider);
}
