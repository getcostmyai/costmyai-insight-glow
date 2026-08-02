/**
 * Minimal AWS SigV4 S3 client for the Worker runtime.
 *
 * Deliberately dependency-free and endpoint-agnostic so the backup destination
 * can be ANY S3-compatible storage in an account we control independently of
 * Lovable: AWS S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO. The whole point
 * of this module is that losing the Lovable account must not lose the backups,
 * so it must never reuse platform-managed credentials.
 */

export type S3Config = {
  endpoint: string; // e.g. https://<account>.r2.cloudflarestorage.com
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function readS3Config(): S3Config | null {
  const endpoint = process.env["BACKUP_S3_ENDPOINT"];
  const bucket = process.env["BACKUP_S3_BUCKET"];
  const accessKeyId = process.env["BACKUP_S3_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["BACKUP_S3_SECRET_ACCESS_KEY"];
  const region = process.env["BACKUP_S3_REGION"] ?? "auto";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

const enc = new TextEncoder();

async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buf =
    typeof data === "string"
      ? (enc.encode(data) as unknown as ArrayBuffer)
      : data instanceof Uint8Array
        ? (data.slice().buffer as ArrayBuffer)
        : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return hex(new Uint8Array(digest));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<Uint8Array> {
  const raw = key instanceof Uint8Array ? (key.slice().buffer as ArrayBuffer) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return new Uint8Array(sig);
}

function uriEncode(value: string, encodeSlash: boolean): string {
  return value
    .split("")
    .map((ch) => {
      if (/[A-Za-z0-9\-._~]/.test(ch)) return ch;
      if (ch === "/") return encodeSlash ? "%2F" : "/";
      return "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}

type SignedRequest = {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  key?: string;
  query?: Record<string, string>;
  body?: Uint8Array;
  contentType?: string;
};

async function signedFetch(cfg: S3Config, req: SignedRequest): Promise<Response> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const url = new URL(cfg.endpoint);
  const path = "/" + cfg.bucket + (req.key ? "/" + req.key : "");
  url.pathname = path;

  const query = req.query ?? {};
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k, true)}=${uriEncode(query[k]!, true)}`)
    .join("&");
  url.search = canonicalQuery;

  const payloadHash = await sha256Hex(req.body ?? "");
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (req.contentType) headers["content-type"] = req.contentType;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]!.trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    req.method,
    uriEncode(path, false),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  let signingKey = await hmac(enc.encode("AWS4" + cfg.secretAccessKey), dateStamp);
  signingKey = await hmac(signingKey, cfg.region);
  signingKey = await hmac(signingKey, "s3");
  signingKey = await hmac(signingKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));

  headers["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url.toString(), {
    method: req.method,
    headers,
    body: req.body ? (req.body.slice().buffer as ArrayBuffer) : undefined,
  });
}

export async function putObject(
  cfg: S3Config,
  key: string,
  body: Uint8Array,
  contentType = "application/gzip",
): Promise<void> {
  const res = await signedFetch(cfg, { method: "PUT", key, body, contentType });
  if (!res.ok) {
    throw new Error(`S3 PUT failed [${res.status}]: ${await res.text()}`);
  }
}

export async function listObjects(cfg: S3Config, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const query: Record<string, string> = { "list-type": "2", prefix, "max-keys": "1000" };
    if (token) query["continuation-token"] = token;
    const res = await signedFetch(cfg, { method: "GET", query });
    if (!res.ok) throw new Error(`S3 LIST failed [${res.status}]: ${await res.text()}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]!);
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    token = xml.includes("<IsTruncated>true</IsTruncated>") && next ? next[1] : undefined;
  } while (token);
  return keys;
}

export async function deleteObject(cfg: S3Config, key: string): Promise<void> {
  const res = await signedFetch(cfg, { method: "DELETE", key });
  if (!res.ok && res.status !== 404) {
    throw new Error(`S3 DELETE failed [${res.status}]: ${await res.text()}`);
  }
}

export async function verifyDestination(cfg: S3Config): Promise<void> {
  const res = await signedFetch(cfg, { method: "GET", query: { "list-type": "2", "max-keys": "1" } });
  if (!res.ok) throw new Error(`S3 destination unreachable [${res.status}]: ${await res.text()}`);
}
