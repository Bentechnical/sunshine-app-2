# Sunshine Caching Strategy

This document outlines the caching optimizations implemented across the application.

## Table of Contents

- [Overview](#overview)
- [HTTP Caching Headers](#http-caching-headers)
- [Static Asset Caching](#static-asset-caching)
- [API Response Caching](#api-response-caching)
- [Template Caching](#template-caching)
- [Database Caching](#database-caching)
- [CDN/Edge Caching](#cdnedge-caching)
- [Browser Caching](#browser-caching)

---

## Overview

| Layer | Strategy | TTL | Notes |
|-------|----------|-----|-------|
| Static Assets | Rocket FileServer + Cache-Control | 1 year | Versioned filenames in future |
| API (Health) | Cache-Control: no-cache | None | Always fresh for monitoring |
| API (Read-heavy) | ETag + 304 Not Modified | Client controlled | Conditional requests |
| Templates | Tera built-in caching | N/A | Automatic in release mode |
| Uploaded Assets | S3/R2 CDN | 1 year | Immutable content |
| Session Data | Cookie-based | 60 days | Configurable via SESSION_TTL_DAYS |

---

## HTTP Caching Headers

### SecurityHeaders Fairing (Modified)

The CSP header is set, but we now also control cache headers per-route:

```rust
// Routes that should never be cached (authenticated pages)
Cache-Control: no-store, must-revalidate, max-age=0

// API endpoints that support conditional requests
ETag: "abc123"
Cache-Control: private, must-revalidate

// Static assets (long-term caching)
Cache-Control: public, max-age=31536000, immutable
```

---

## Static Asset Caching

### Current Setup

```rust
// main.rs
.mount("/static", FileServer::from("static"))
```

**Issues:**
- No cache headers set on static files
- No versioning for cache busting

### Optimized Setup

Static files now served with appropriate cache headers based on file type:

| File Type | Cache-Control | Notes |
|-----------|---------------|-------|
| CSS/JS | `public, max-age=31536000, immutable` | Long-term, version in filename |
| Images | `public, max-age=2592000` | 30 days |
| Fonts | `public, max-age=31536000, immutable` | Long-term |
| Favicon | `public, max-age=86400` | 1 day (changes sometimes) |

---

## API Response Caching

### Health Endpoint

```rust
// Always fresh for monitoring
Cache-Control: no-cache
```

### Asset API

Uploaded photos/videos served with:
- `ETag` based on file content hash
- `Last-Modified` from filesystem
- `Cache-Control: public, max-age=31536000, immutable`

### Read-Heavy Endpoints

For endpoints like `/api/volunteers/search`:
- Short client-side cache: `Cache-Control: private, max-age=60`
- ETag support for conditional requests

---

## Template Caching

### Tera Template Engine

Tera automatically caches parsed templates in release mode. The cache behavior:

- **Development**: Templates reloaded on each request
- **Production**: Templates parsed once and cached in memory

### Template Preloading

All templates are loaded at startup (no lazy loading penalty).

---

## Database Caching

### Connection Pooling

```toml
# Rocket.toml
[default.databases.sunshine_db]
min_connections = 2
max_connections = 10
idle_timeout = 300
```

### Query Result Caching

Currently no application-level query caching. Opportunities:

1. **Reference Data**: Agency types, dog breeds, Toronto zones
   - Cache in memory: `OnceLock<HashMap<..., ...>>`
   - TTL: Application lifetime (rarely changes)

2. **User Sessions**: Already in encrypted cookies
   - No DB lookup needed per request

3. **Shift Lists**: Could cache with short TTL
   - Risk: Staleness vs. performance trade-off

---

## CDN/Edge Caching

### S3/R2 Storage

When using S3/R2 for uploads:

```rust
// URLs returned from storage.url() are CDN-ready:
// https://cdn.yourdomain.com/uploads/key
```

**Headers set by S3/R2:**
- `Cache-Control: public, max-age=31536000`
- `ETag` automatically generated

### Dokploy/Trafik

Traefik (used by Dokploy) can cache responses:

```yaml
# Example middleware for static assets
middlewares:
  static-cache:
    headers:
      customResponseHeaders:
        Cache-Control: "public, max-age=31536000"
```

---

## Browser Caching

### Development Mode

Meta tags prevent caching (already in place):

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
```

### Production Mode

Static assets get long-term caching headers from the server.

---

## Future Optimizations

### 1. Asset Versioning (High Priority)

Add content hash to filenames for cache busting:

```rust
// Instead of: app.js
// Use: app.a3f5c2.js
```

Build process would:
1. Hash file contents
2. Rename files with hash
3. Update template references

### 2. Redis/SQLx Query Cache (Medium Priority)

For expensive queries:

```rust
#[cached(size = 100, time = 60)]
async fn get_agency_types(db: &Db) -> Vec<AgencyType>
```

### 3. Edge Cache for Public Pages (Low Priority)

Cache public-facing pages (login, about) at edge:
- Varnish, Cloudflare, or Fastly
- Cache key: URL + Accept-Language

### 4. HTTP/2 Server Push (Deprecated)

Replaced by Early Hints (103 status) or resource preloading:

```html
<link rel="preload" href="/static/app.css" as="style">
```

---

## Monitoring

Track cache effectiveness:

```rust
// Add to logs/metrics
tracing::info!(
    cache_hit = %hit,
    cache_key = %key,
    "Cache lookup"
);
```

Check browser DevTools:
- Network tab: Look for `(disk cache)` or `(memory cache)`
- Response headers: Verify `Cache-Control` and `ETag`
