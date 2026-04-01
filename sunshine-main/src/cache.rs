//! Caching utilities and fairings.
//!
//! Provides Cache-Control header management for static assets and API responses.

use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::Header;
use rocket::{Request, Response};
use std::path::Path;

/// Cache-Control directives for different resource types.
pub struct CacheConfig {
    /// Static assets with content hashing (immutable)
    pub static_immutable: &'static str,
    /// Static assets without hashing (CSS, JS that may change)
    pub static_versioned: &'static str,
    /// Images and media files
    pub images: &'static str,
    /// API responses that can be cached briefly
    pub api_short: &'static str,
    /// API responses that shouldn't be cached
    pub api_no_cache: &'static str,
    /// Authenticated pages (private, no cache)
    pub private_no_cache: &'static str,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            // 1 year for immutable content (content-addressed)
            static_immutable: "public, max-age=31536000, immutable",
            // 1 day for versioned assets (e.g., /static/app.v123.js)
            static_versioned: "public, max-age=86400",
            // 30 days for images
            images: "public, max-age=2592000",
            // 60 seconds for API reads (prevents thundering herd)
            api_short: "private, max-age=60",
            // No caching for dynamic API
            api_no_cache: "no-store, must-revalidate, max-age=0",
            // Authenticated pages
            private_no_cache: "private, no-store, must-revalidate, max-age=0",
        }
    }
}

impl CacheConfig {
    /// Get Cache-Control header based on path and content type.
    pub fn for_path(&self, path: &str) -> Option<&'static str> {
        let path_lower = path.to_lowercase();
        
        // Static assets in /static/
        if path.starts_with("/static/") {
            if path_lower.contains(".min.") || path_lower.contains('?') {
                // Minified or versioned files get long cache
                Some(self.static_immutable)
            } else if path_lower.ends_with(".css") || path_lower.ends_with(".js") {
                Some(self.static_versioned)
            } else if path_lower.ends_with(".png") 
                || path_lower.ends_with(".jpg")
                || path_lower.ends_with(".jpeg")
                || path_lower.ends_with(".gif")
                || path_lower.ends_with(".webp")
                || path_lower.ends_with(".svg")
                || path_lower.ends_with(".ico")
            {
                Some(self.images)
            } else if path_lower.ends_with(".woff") 
                || path_lower.ends_with(".woff2")
                || path_lower.ends_with(".ttf")
                || path_lower.ends_with(".otf")
            {
                // Fonts are immutable
                Some(self.static_immutable)
            } else {
                Some(self.static_versioned)
            }
        }
        // Uploaded assets (/uploads/)
        else if path.starts_with("/uploads/") {
            // User uploads are immutable (new URL = new content)
            Some(self.static_immutable)
        }
        // API endpoints
        else if path.starts_with("/api/") {
            if path == "/api/health" || path == "/health" {
                // Health check - always fresh
                Some(self.api_no_cache)
            } else if path.contains("/search") || path.contains("/list") {
                // Read-heavy endpoints - brief cache
                Some(self.api_short)
            } else {
                // Mutations and dynamic endpoints - no cache
                Some(self.api_no_cache)
            }
        }
        // Favicon
        else if path == "/favicon.ico" {
            Some(self.images)
        }
        // Default: no caching for HTML pages
        else {
            None
        }
    }
}

/// Fairing that adds appropriate Cache-Control headers to responses.
pub struct CacheHeaders {
    config: CacheConfig,
}

impl CacheHeaders {
    pub fn new() -> Self {
        Self {
            config: CacheConfig::default(),
        }
    }

    pub fn with_config(config: CacheConfig) -> Self {
        Self { config }
    }
}

impl Default for CacheHeaders {
    fn default() -> Self {
        Self::new()
    }
}

#[rocket::async_trait]
impl Fairing for CacheHeaders {
    fn info(&self) -> Info {
        Info {
            name: "Cache Headers",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(&self, req: &'r Request<'_>, res: &mut Response<'r>) {
        let path = req.uri().path().as_str();
        
        // Only add Cache-Control if not already set
        if res.headers().get_one("Cache-Control").is_none() {
            if let Some(cache_value) = self.config.for_path(path) {
                res.set_header(Header::new("Cache-Control", cache_value));
            }
        }

        // Add Vary header for API endpoints to help caches
        if path.starts_with("/api/") && res.headers().get_one("Vary").is_none() {
            res.set_header(Header::new("Vary", "Accept, Accept-Encoding, Authorization"));
        }
    }
}

/// Generate an ETag for content based on its hash.
pub fn generate_etag(content: &[u8]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    let hash = hasher.finish();
    format!("\"{:x}\"", hash)
}

/// Check if the request's If-None-Match header matches the ETag.
pub fn etag_matches(req: &Request<'_>, etag: &str) -> bool {
    req.headers()
        .get_one("If-None-Match")
        .map(|inm| inm == etag)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_config_static_files() {
        let config = CacheConfig::default();
        
        // Immutable assets (minified or query string versioned)
        assert_eq!(
            config.for_path("/static/app.min.js"),
            Some(config.static_immutable)
        );
        assert_eq!(
            config.for_path("/static/app.min.css"),
            Some(config.static_immutable)
        );
        assert_eq!(
            config.for_path("/static/app.js?v=123"),
            Some(config.static_immutable)
        );
        
        // Regular CSS/JS (shorter cache)
        assert_eq!(
            config.for_path("/static/app.css"),
            Some(config.static_versioned)
        );
        assert_eq!(
            config.for_path("/static/app.js"),
            Some(config.static_versioned)
        );
        
        // Images
        assert_eq!(
            config.for_path("/static/logo.png"),
            Some(config.images)
        );
        
        // Fonts (immutable)
        assert_eq!(
            config.for_path("/static/fonts/app.woff2"),
            Some(config.static_immutable)
        );
    }

    #[test]
    fn test_cache_config_api() {
        let config = CacheConfig::default();
        
        // Health check - no cache
        assert_eq!(
            config.for_path("/api/health"),
            Some(config.api_no_cache)
        );
        
        // Search endpoints - short cache
        assert_eq!(
            config.for_path("/api/volunteers/search"),
            Some(config.api_short)
        );
        
        // Other API - no cache
        assert_eq!(
            config.for_path("/api/shifts/123"),
            Some(config.api_no_cache)
        );
    }

    #[test]
    fn test_cache_config_uploads() {
        let config = CacheConfig::default();
        
        // User uploads are immutable
        assert_eq!(
            config.for_path("/uploads/abc123/photo.jpg"),
            Some(config.static_immutable)
        );
    }

    #[test]
    fn test_etag_generation() {
        let content1 = b"hello world";
        let content2 = b"hello world";
        let content3 = b"different content";
        
        let etag1 = generate_etag(content1);
        let etag2 = generate_etag(content2);
        let etag3 = generate_etag(content3);
        
        // Same content = same ETag
        assert_eq!(etag1, etag2);
        
        // Different content = different ETag
        assert_ne!(etag1, etag3);
        
        // ETags are quoted
        assert!(etag1.starts_with('\"') && etag1.ends_with('\"'));
    }
}
