function getKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export async function encryptSecret(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", getKey(), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

export async function decryptSecret(value: string): Promise<string> {
  const [ivPart, dataPart] = value.split(".");
  if (!ivPart || !dataPart) throw new Error("Encrypted token is malformed.");
  const key = await crypto.subtle.importKey("raw", getKey(), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(ivPart, "base64url") },
    key,
    Buffer.from(dataPart, "base64url"),
  );
  return new TextDecoder().decode(plain);
}
