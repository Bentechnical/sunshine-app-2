//! Sunshine management CLI.
//!
//! Run inside the container:
//!   ./manage create-superuser --email admin@example.com --name "Jane Doe"
//!   ./manage bulk-invite --csv users.csv --batch-size 5 --delay-secs 120
//!
//! The CSV format for bulk-invite:
//!   role,first_name,last_name,email,phone,join_date
//!   volunteer,Jane,Doe,jane@example.com,416-555-1234,2026-03-01
//!   agency_contact,Bob,Smith,bob@agency.org,647-555-9876,2026-03-01

use anyhow::{bail, Context, Result};
use chrono::Utc;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use lettre::{
    message::{header::ContentType, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

// ─── DB URL parsing ─────────────────────────────────────────────────────────

fn get_database_url() -> Result<String> {
    // Try DATABASE_URL first
    if let Ok(url) = std::env::var("DATABASE_URL") {
        if !url.is_empty() {
            return Ok(url);
        }
    }
    // Fall back to parsing ROCKET_DATABASES
    if let Ok(rocket_db) = std::env::var("ROCKET_DATABASES") {
        // Format: {sunshine_db={url="postgres://..."}}
        if let Some(start) = rocket_db.find("url=\"") {
            let rest = &rocket_db[start + 5..];
            if let Some(end) = rest.find('"') {
                return Ok(rest[..end].to_string());
            }
        }
    }
    bail!("Set DATABASE_URL or ROCKET_DATABASES")
}

// ─── Magic link token (standalone, no Rocket dependency) ────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct MagicLinkClaims {
    sub: String,
    jti: String,
    iat: i64,
    exp: i64,
}

async fn create_magic_link(
    pool: &sqlx::PgPool,
    email: &str,
    secret: &str,
    ttl_minutes: u64,
) -> Result<String> {
    let jti = Uuid::new_v4().to_string();
    let now = Utc::now();
    let exp = now + chrono::Duration::minutes(ttl_minutes as i64);

    let claims = MagicLinkClaims {
        sub: email.to_lowercase(),
        jti: jti.clone(),
        iat: now.timestamp(),
        exp: exp.timestamp(),
    };

    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .context("JWT encode error")?;

    sqlx::query(
        "INSERT INTO magic_links (email, jti, expires_at)
         VALUES ($1, $2, $3)",
    )
    .bind(email.to_lowercase())
    .bind(&jti)
    .bind(exp)
    .execute(pool)
    .await?;

    Ok(token)
}

// ─── Email sending (standalone) ─────────────────────────────────────────────

struct SmtpConfig {
    host: String,
    port: u16,
    username: String,
    password: String,
    from: String,
    from_name: String,
    app_name: String,
    app_url: String,
    enabled: bool,
}

impl SmtpConfig {
    fn from_env() -> Self {
        let username = std::env::var("SMTP_USERNAME").unwrap_or_default();
        let password = std::env::var("SMTP_PASSWORD").unwrap_or_default();
        let enabled = !username.is_empty() && !password.is_empty();

        let env_str = std::env::var("ENVIRONMENT")
            .or_else(|_| std::env::var("ROCKET_ENV"))
            .unwrap_or_else(|_| "development".into())
            .to_lowercase();

        let is_prod = matches!(env_str.as_str(), "prod" | "production" | "stage" | "staging");

        let mut app_url = std::env::var("APP_URL")
            .unwrap_or_else(|_| "http://localhost:8000".into());

        if is_prod {
            if let Ok(mut url) = url::Url::parse(&app_url) {
                if url.port().is_some() {
                    let _ = url.set_port(None);
                    app_url = url.to_string().trim_end_matches('/').to_string();
                }
            }
        }

        Self {
            host: std::env::var("SMTP_HOST").unwrap_or_else(|_| "smtp-relay.brevo.com".into()),
            port: std::env::var("SMTP_PORT")
                .unwrap_or_else(|_| "587".into())
                .parse()
                .unwrap_or(587),
            username,
            password,
            from: std::env::var("EMAIL_FROM").unwrap_or_else(|_| "noreply@sunshine.local".into()),
            from_name: std::env::var("EMAIL_FROM_NAME")
                .unwrap_or_else(|_| "Sunshine Volunteers".into()),
            app_name: std::env::var("APP_NAME").unwrap_or_else(|_| "Sunshine".into()),
            app_url,
            enabled,
        }
    }

    async fn send_invite(&self, to_email: &str, name: &str, token: &str) -> Result<()> {
        let link = format!("{}/auth/verify?token={}", self.app_url, token);

        if !self.enabled {
            println!("  [DEV] Magic link for {to_email}: {link}");
            return Ok(());
        }

        let subject = format!("Welcome to {} — set up your account", self.app_name);
        let text = format!(
            "Hi {name},\n\n\
             You've been invited to join {app}!\n\n\
             Click here to set up your account:\n{link}\n\n\
             This link expires in 15 minutes and can only be used once.\n\n\
             — The {app} Team",
            name = name,
            app = self.app_name,
            link = link,
        );
        let html = format!(
            r#"<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
  <h2 style="color: #d97706;">☀️ {app}</h2>
  <p>Hi {name},</p>
  <p>You've been invited to join <strong>{app}</strong>! Click below to set up your account.</p>
  <p style="margin: 32px 0;">
    <a href="{link}"
       style="background: #f59e0b; color: #fff; padding: 14px 28px; border-radius: 8px;
              text-decoration: none; font-weight: bold; font-size: 16px;">
      Set Up Your Account
    </a>
  </p>
  <p style="color: #666; font-size: 13px;">
    Or copy this link: <a href="{link}">{link}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
  <p style="color: #999; font-size: 12px;">
    This link expires in 15 minutes and can only be used once.
  </p>
</body>
</html>"#,
            app = self.app_name,
            name = name,
            link = link,
        );

        let creds = Credentials::new(self.username.clone(), self.password.clone());
        let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&self.host)
            .context("Invalid SMTP host")?
            .credentials(creds)
            .port(self.port)
            .build();

        let from: Mailbox = format!("{} <{}>", self.from_name, self.from)
            .parse()
            .context("Invalid from address")?;
        let to_mailbox: Mailbox = to_email.parse().context("Invalid to address")?;

        let email = Message::builder()
            .from(from)
            .to(to_mailbox)
            .subject(&subject)
            .multipart(
                MultiPart::alternative()
                    .singlepart(
                        SinglePart::builder()
                            .header(ContentType::TEXT_PLAIN)
                            .body(text),
                    )
                    .singlepart(
                        SinglePart::builder()
                            .header(ContentType::TEXT_HTML)
                            .body(html),
                    ),
            )
            .context("Failed to build email")?;

        transport
            .send(email)
            .await
            .context("Failed to send email")?;

        Ok(())
    }
}

// ─── CSV row ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct CsvRow {
    role: String,
    first_name: String,
    last_name: String,
    email: String,
    phone: Option<String>,
    join_date: Option<String>,
}

// ─── Commands ───────────────────────────────────────────────────────────────

async fn cmd_create_superuser(pool: &sqlx::PgPool, email: &str, name: &str) -> Result<()> {
    let email = email.trim().to_lowercase();

    // Check if user already exists
    let existing: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT id, role::TEXT FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(pool)
    .await?;

    if let Some((id, role)) = existing {
        if role == "admin" {
            println!("User {email} is already an admin (id={id}).");
            return Ok(());
        }
        // Promote to admin
        sqlx::query("UPDATE users SET role = 'admin', is_active = true, updated_at = now() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        println!("Promoted existing user {email} to admin (id={id}).");
    } else {
        let id: (Uuid,) = sqlx::query_as(
            "INSERT INTO users (email, role, display_name, is_active)
             VALUES ($1, 'admin', $2, true)
             RETURNING id",
        )
        .bind(&email)
        .bind(name)
        .fetch_one(pool)
        .await?;
        println!("Created admin user {email} (id={}).", id.0);
    }

    Ok(())
}

async fn cmd_bulk_invite(
    pool: &sqlx::PgPool,
    csv_path: &str,
    batch_size: usize,
    delay_secs: u64,
) -> Result<()> {
    let smtp = SmtpConfig::from_env();
    let secret = std::env::var("MAGIC_LINK_SECRET")
        .unwrap_or_else(|_| "dev-only-insecure-secret-change-in-prod".into());
    let ttl: u64 = std::env::var("MAGIC_LINK_TTL_MINUTES")
        .unwrap_or_else(|_| "15".into())
        .parse()
        .unwrap_or(15);

    let mut rdr = csv::Reader::from_path(csv_path)
        .with_context(|| format!("Cannot open CSV: {csv_path}"))?;

    let rows: Vec<CsvRow> = rdr.deserialize().collect::<Result<Vec<_>, _>>()?;
    let total = rows.len();
    println!("Loaded {total} rows from {csv_path}");
    println!("Batch size: {batch_size}, delay between batches: {delay_secs}s");

    let mut sent = 0;
    for (i, row) in rows.iter().enumerate() {
        let email = row.email.trim().to_lowercase();
        let display_name = format!("{} {}", row.first_name.trim(), row.last_name.trim());
        let role = match row.role.trim().to_lowercase().as_str() {
            "admin" => "admin",
            "agency_contact" | "agency" => "agency_contact",
            _ => "volunteer",
        };

        // Create or update user
        let user_id: Uuid = match sqlx::query_as::<_, (Uuid,)>(
            "SELECT id FROM users WHERE email = $1",
        )
        .bind(&email)
        .fetch_optional(pool)
        .await?
        {
            Some((id,)) => {
                println!("  [{}/{}] {email} — already exists, skipping user creation", i + 1, total);
                id
            }
            None => {
                let (id,): (Uuid,) = sqlx::query_as(
                    "INSERT INTO users (email, role, display_name, is_active)
                     VALUES ($1, $2::user_role, $3, true)
                     RETURNING id",
                )
                .bind(&email)
                .bind(role)
                .bind(&display_name)
                .fetch_one(pool)
                .await?;
                println!("  [{}/{}] Created {role} user: {email} (id={id})", i + 1, total);
                id
            }
        };

        // Create volunteer profile if volunteer
        if role == "volunteer" {
            let volunteer_names = format!("{} {}", row.first_name.trim(), row.last_name.trim());
            sqlx::query(
                "INSERT INTO volunteer_profiles (user_id, volunteer_names)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id) DO NOTHING",
            )
            .bind(user_id)
            .bind(&volunteer_names)
            .execute(pool)
            .await?;
        }

        // Store phone in notification preferences if provided
        let phone = row.phone.as_deref().unwrap_or("").trim();
        sqlx::query(
            "INSERT INTO notification_preferences (user_id, sms_phone)
             VALUES ($1, NULLIF($2, ''))
             ON CONFLICT (user_id) DO NOTHING",
        )
        .bind(user_id)
        .bind(phone)
        .execute(pool)
        .await?;

        // Generate magic link and send invite
        let token = create_magic_link(pool, &email, &secret, ttl).await?;
        smtp.send_invite(&email, &display_name, &token).await?;
        println!("  [{}/{}] Invite sent to {email}", i + 1, total);

        sent += 1;

        // Batch delay
        if sent % batch_size == 0 && i + 1 < total {
            println!("  — Batch of {batch_size} sent. Waiting {delay_secs}s...");
            tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
        }
    }

    println!("\nDone! Sent {sent} invites.");
    Ok(())
}

// ─── Main ───────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str());

    match cmd {
        Some("create-superuser") => {
            let email = get_arg(&args, "--email")
                .context("--email is required")?;
            let name = get_arg(&args, "--name")
                .unwrap_or_else(|| "Admin".to_string());

            let pool = connect_db().await?;
            cmd_create_superuser(&pool, &email, &name).await?;
        }
        Some("bulk-invite") => {
            let csv_path = get_arg(&args, "--csv")
                .context("--csv is required")?;
            let batch_size: usize = get_arg(&args, "--batch-size")
                .unwrap_or_else(|| "5".to_string())
                .parse()
                .context("--batch-size must be a number")?;
            let delay_secs: u64 = get_arg(&args, "--delay-secs")
                .unwrap_or_else(|| "120".to_string())
                .parse()
                .context("--delay-secs must be a number")?;

            let pool = connect_db().await?;
            cmd_bulk_invite(&pool, &csv_path, batch_size, delay_secs).await?;
        }
        _ => {
            eprintln!("Sunshine Management CLI\n");
            eprintln!("Usage:");
            eprintln!("  manage create-superuser --email <email> [--name <name>]");
            eprintln!("  manage bulk-invite --csv <path> [--batch-size 5] [--delay-secs 120]");
            eprintln!("\nCSV format (with header row):");
            eprintln!("  role,first_name,last_name,email,phone,join_date");
            eprintln!("  volunteer,Jane,Doe,jane@example.com,416-555-1234,2026-03-01");
            std::process::exit(1);
        }
    }

    Ok(())
}

fn get_arg(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

async fn connect_db() -> Result<sqlx::PgPool> {
    let url = get_database_url()?;
    PgPoolOptions::new()
        .max_connections(3)
        .connect(&url)
        .await
        .context("Failed to connect to database")
}
