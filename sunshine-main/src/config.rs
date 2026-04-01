use anyhow::{Context, Result};

#[derive(Debug, Clone, PartialEq)]
pub enum Environment {
    Development,
    Production,
    Staging,
}

impl Environment {
    pub fn is_prod(&self) -> bool {
        matches!(self, Self::Production | Self::Staging)
    }

    pub fn is_dev(&self) -> bool {
        matches!(self, Self::Development)
    }
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub app_url: String,
    pub app_name: String,
    pub environment: Environment,

    // Email
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub email_from: String,
    pub email_from_name: String,

    // Auth
    pub magic_link_secret: String,
    pub magic_link_ttl_minutes: u64,
    pub session_ttl_days: u64,

    // Storage (S3 / R2)
    pub s3_endpoint: String,
    pub s3_bucket: String,
    pub s3_access_key_id: String,
    pub s3_secret_access_key: String,
    pub s3_public_url: String,

    // Local file uploads (used when s3_endpoint is empty)
    pub upload_dir: String,

    // Maps
    pub google_maps_api_key: Option<String>,
    pub use_geocode_cache: bool,
    pub geocode_cache_path: String,

    // Clerk auth (when set, replaces magic-link / session auth in production)
    pub clerk_publishable_key: Option<String>,
    pub clerk_account_url: Option<String>,
}

fn percent_encode(s: &str) -> String {
    s.chars()
        .flat_map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => vec![c],
            c => format!("%{:02X}", c as u32).chars().collect(),
        })
        .collect()
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        let env_str = std::env::var("ENVIRONMENT")
            .or_else(|_| std::env::var("ROCKET_ENV"))
            .unwrap_or_else(|_| "development".into())
            .to_lowercase();

        let environment = match env_str.as_str() {
            "prod" | "production" => Environment::Production,
            "stage" | "staging" => Environment::Staging,
            _ => Environment::Development,
        };

        let mut app_url = std::env::var("APP_URL")
            .unwrap_or_else(|_| "http://localhost:8000".into());

        // Ensure no ports in PROD/STAGING if specified in requirements
        if environment.is_prod() {
            if let Ok(mut url) = url::Url::parse(&app_url) {
                if url.port().is_some() {
                    let _ = url.set_port(None);
                    app_url = url.to_string().trim_end_matches('/').to_string();
                }
            }
        }

        Ok(Self {
            app_url,
            app_name: std::env::var("APP_NAME")
                .unwrap_or_else(|_| "Sunshine".into()),
            environment,

            smtp_host: std::env::var("SMTP_HOST")
                .unwrap_or_else(|_| "smtp-relay.brevo.com".into()),
            smtp_port: std::env::var("SMTP_PORT")
                .unwrap_or_else(|_| "587".into())
                .parse()
                .context("SMTP_PORT must be a number")?,
            smtp_username: std::env::var("SMTP_USERNAME").unwrap_or_default(),
            smtp_password: std::env::var("SMTP_PASSWORD").unwrap_or_default(),
            email_from: std::env::var("EMAIL_FROM")
                .unwrap_or_else(|_| "noreply@sunshine.local".into()),
            email_from_name: std::env::var("EMAIL_FROM_NAME")
                .unwrap_or_else(|_| "Sunshine Volunteers".into()),

            magic_link_secret: std::env::var("MAGIC_LINK_SECRET")
                .unwrap_or_else(|_| "dev-only-insecure-secret-change-in-prod".into()),
            magic_link_ttl_minutes: std::env::var("MAGIC_LINK_TTL_MINUTES")
                .unwrap_or_else(|_| "15".into())
                .parse()
                .unwrap_or(15),
            session_ttl_days: std::env::var("SESSION_TTL_DAYS")
                .unwrap_or_else(|_| "60".into())
                .parse()
                .unwrap_or(60),

            s3_endpoint: std::env::var("S3_ENDPOINT").unwrap_or_default(),
            s3_bucket: std::env::var("S3_BUCKET").unwrap_or_default(),
            s3_access_key_id: std::env::var("S3_ACCESS_KEY_ID").unwrap_or_default(),
            s3_secret_access_key: std::env::var("S3_SECRET_ACCESS_KEY").unwrap_or_default(),
            s3_public_url: std::env::var("S3_PUBLIC_URL").unwrap_or_default(),

            upload_dir: std::env::var("UPLOAD_DIR")
                .unwrap_or_else(|_| "./uploads".into()),

            google_maps_api_key: std::env::var("GOOGLE_MAPS_API_KEY").ok(),
            use_geocode_cache: std::env::var("USE_GEOCODE_CACHE")
                .map(|v| matches!(v.to_lowercase().as_str(), "true" | "1" | "yes"))
                .unwrap_or(false),
            geocode_cache_path: std::env::var("GEOCODE_CACHE_PATH")
                .unwrap_or_else(|_| "./geocode_cache.json".into()),

            clerk_publishable_key: std::env::var("CLERK_PUBLISHABLE_KEY").ok(),
            clerk_account_url: std::env::var("CLERK_ACCOUNT_URL").ok(),
        })
    }

    /// Returns true if Clerk auth is configured.
    pub fn clerk_enabled(&self) -> bool {
        self.clerk_publishable_key.is_some()
    }

    /// Returns the Clerk sign-in URL with `redirect_url` set to our callback.
    pub fn clerk_sign_in_url(&self, app_url: &str) -> Option<String> {
        let account_url = self.clerk_account_url.as_deref()?;
        let _ = self.clerk_publishable_key.as_deref()?;
        let callback = format!("{}/auth/clerk-callback", app_url);
        Some(format!(
            "{}/sign-in?redirect_url={}",
            account_url,
            percent_encode(&callback)
        ))
    }

    /// Returns the Clerk sign-up URL with `redirect_url` set to our callback.
    pub fn clerk_sign_up_url(&self, app_url: &str, return_to: &str) -> Option<String> {
        let account_url = self.clerk_account_url.as_deref()?;
        let _ = self.clerk_publishable_key.as_deref()?;
        let callback = format!(
            "{}/auth/clerk-callback?return_to={}",
            app_url,
            percent_encode(return_to)
        );
        Some(format!(
            "{}/sign-up?redirect_url={}",
            account_url,
            percent_encode(&callback)
        ))
    }
}
