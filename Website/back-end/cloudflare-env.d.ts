declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    REVIEWER_EMAILS?: string;
    TFL_APP_KEY?: string;
  }
}
