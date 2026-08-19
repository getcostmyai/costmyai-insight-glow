import { mintApiKey } from "@/lib/ingest/keys.server";
const k = await mintApiKey("561efc9b-fbfb-479b-a2b7-c31a530e06fe", "Chain drill ingest");
console.log(k.id, k.token);
