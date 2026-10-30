declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    VENTUSIQ_VAPID_PRIVATE_JWK?: string;
    VENTUSIQ_PINNED_ROUTER_URL?: string;
    VENTUSIQ_PINNED_GRAPH_SHA256?: string;
    VENTUSIQ_PINNED_ROUTER_TOKEN?: string;
    BUCKET?: R2Bucket;
  }
}
declare module '*?raw' { const value: string; export default value; }
