declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    VENTUSIQ_VAPID_PRIVATE_JWK?: string;
    BUCKET?: R2Bucket;
  }
}
declare module '*?raw' { const value: string; export default value; }
