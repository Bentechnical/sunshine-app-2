//! Response fairing that injects an impersonation banner into HTML pages.

use super::session::{ImpersonatePayload, IMPERSONATE_COOKIE};
use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::Header;
use rocket::{Request, Response};
use std::io::Cursor;

pub struct ImpersonationBanner;

#[rocket::async_trait]
impl Fairing for ImpersonationBanner {
    fn info(&self) -> Info {
        Info {
            name: "Impersonation Banner",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(&self, req: &'r Request<'_>, res: &mut Response<'r>) {
        // Skip non-success or redirect responses
        let status = res.status().code;
        if status >= 300 {
            return;
        }

        // Only process HTML responses
        let is_html = res
            .headers()
            .get_one("Content-Type")
            .map(|ct| ct.contains("text/html"))
            .unwrap_or(false);
        if !is_html {
            return;
        }

        // Check for impersonation cookie
        let cookie = match req.cookies().get_private(IMPERSONATE_COOKIE) {
            Some(c) => c,
            None => return,
        };

        let payload: ImpersonatePayload = match serde_json::from_str(cookie.value()) {
            Ok(p) => p,
            Err(_) => return,
        };

        // Read the body
        let body = match res.body_mut().to_string().await {
            Ok(b) => b,
            Err(_) => return,
        };

        // Only inject into full HTML pages (HTMX partials won't have </body>)
        if !body.contains("</body>") {
            res.set_sized_body(body.len(), Cursor::new(body));
            return;
        }

        let banner = format!(
            r##"<div id="impersonation-banner" style="
                position:relative; z-index:99999;
                background:linear-gradient(135deg,#6366f1,#7c3aed);
                color:#fff; padding:8px 16px;
                display:flex; align-items:center; justify-content:center;
                gap:12px; font-family:system-ui,sans-serif; font-size:14px;
                box-shadow:0 2px 8px rgba(0,0,0,0.1);
            ">
                <svg style="width:16px;height:16px;flex-shrink:0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <span>Viewing as <strong>{name}</strong> ({role})</span>
                <form action="/admin/stop-impersonate" method="post" style="margin:0">
                    <button type="submit" style="
                        background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.4);
                        color:#fff; padding:4px 12px; border-radius:6px;
                        cursor:pointer; font-size:13px; font-weight:600;
                    ">Stop Impersonating</button>
                </form>
            </div>"##,
            name = html_escape(&payload.display_name),
            role = html_escape(&payload.role),
        );

        let new_body = if body.contains("<body") {
            // Find the end of the opening body tag
            if let Some(pos) = body.find('>') {
                let (start, end) = body.split_at(pos + 1);
                format!("{start}{banner}{end}")
            } else {
                body
            }
        } else {
            body
        };
        res.remove_header("Content-Length");
        res.set_header(Header::new(
            "Content-Length",
            new_body.len().to_string(),
        ));
        res.set_sized_body(new_body.len(), Cursor::new(new_body));
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
