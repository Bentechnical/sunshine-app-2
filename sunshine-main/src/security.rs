//! Security headers fairing.
//!
//! Attaches HTTP security headers to every response. Rocket already adds
//! X-Frame-Options, X-Content-Type-Options, and Permissions-Policy; this
//! fairing fills in the remaining gaps.

use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::Header;
use rocket::{Request, Response};

pub struct SecurityHeaders;

/// Content-Security-Policy for the app.
///
/// Constraints:
/// - `unsafe-inline` is needed for the inline Tailwind config <script> block
///   and Alpine.js x-* directive handlers. Long-term fix: move Tailwind to a
///   compiled bundle and serve it locally, eliminating the CDN + unsafe-inline.
/// - `unsafe-eval` is required by Alpine.js for reactive expressions.
/// - `img-src https:` allows photos served from Cloudflare R2 / S3 in prod.
/// - `connect-src 'self'` restricts HTMX XHR to same origin.
/// - `frame-ancestors 'none'` is stricter than X-Frame-Options: SAMEORIGIN.
/// - `form-action 'self'` prevents form submissions to external sites.
/// - `base-uri 'self'` prevents <base href> injection attacks.
const CSP: &str = concat!(
    "default-src 'self'; ",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://maps.googleapis.com https://storage.googleapis.com; ",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ",
    "img-src 'self' data: blob: https:; ",
    "connect-src 'self' https://maps.googleapis.com https://places.googleapis.com; ",
    "font-src 'self' https://fonts.gstatic.com; ",
    "object-src 'none'; ",
    "frame-ancestors 'none'; ",
    "form-action 'self'; ",
    "base-uri 'self';",
);

#[rocket::async_trait]
impl Fairing for SecurityHeaders {
    fn info(&self) -> Info {
        Info {
            name: "Security Headers",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(&self, _req: &'r Request<'_>, res: &mut Response<'r>) {
        res.set_header(Header::new("Content-Security-Policy", CSP));
        res.set_header(Header::new(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        ));
        res.set_header(Header::new(
            "Referrer-Policy",
            "strict-origin-when-cross-origin",
        ));
        res.set_header(Header::new("Cross-Origin-Opener-Policy", "same-origin"));
    }
}
