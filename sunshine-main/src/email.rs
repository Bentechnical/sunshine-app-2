//! Email delivery via SMTP (Brevo by default).
//!
//! In development, if SMTP credentials are not configured, emails are
//! not sent — instead the magic link is logged at INFO level so you can
//! copy/paste it directly into the browser.

use anyhow::{Context, Result};
use lettre::{
    message::{header::ContentType, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

use crate::config::AppConfig;

#[derive(Clone)]
pub struct EmailService {
    // Raw SMTP config — transport is built lazily inside async send() calls
    // so it's constructed within the Tokio runtime context.
    smtp_host: String,
    smtp_port: u16,
    smtp_username: String,
    smtp_password: String,
    smtp_enabled: bool,
    from: String,
    from_name: String,
    app_name: String,
    app_url: String,
}

impl EmailService {
    pub fn new(cfg: &AppConfig) -> Self {
        let smtp_enabled = !cfg.smtp_username.is_empty() && !cfg.smtp_password.is_empty();
        if !smtp_enabled {
            tracing::warn!("SMTP credentials not configured — emails will be logged only");
        }
        Self {
            smtp_host: cfg.smtp_host.clone(),
            smtp_port: cfg.smtp_port,
            smtp_username: cfg.smtp_username.clone(),
            smtp_password: cfg.smtp_password.clone(),
            smtp_enabled,
            from: cfg.email_from.clone(),
            from_name: cfg.email_from_name.clone(),
            app_name: cfg.app_name.clone(),
            app_url: cfg.app_url.clone(),
        }
    }

    /// Send a magic link sign-in email.
    #[allow(dead_code)]
    pub async fn send_magic_link(&self, to_email: &str, token: &str) -> Result<()> {
        let link = format!("{}/auth/verify?token={}", self.app_url, token);

        // Always log magic link in console during development for easier testing
        #[cfg(any(debug_assertions, feature = "dev-routes"))]
        {
            println!("\n\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
            println!("┃ 📨 [DEV] MAGIC LINK FOR: {:<50} ┃", to_email);
            println!("┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫");
            println!("┃ {:<75} ┃", link);
            println!("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n");
        }

        if !self.smtp_enabled {
            return Ok(());
        }

        let subject = format!("Your {} sign-in link", self.app_name);
        let text = format!(
            "Sign in to {app}:\n\n{link}\n\nThis link expires in 15 minutes and can only be used once.\n\nIf you didn't request this, ignore this email.",
            app = self.app_name,
            link = link,
        );
        let html = format!(
            r#"<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
  <h2 style="color: #d97706;">☀️ {app}</h2>
  <p>Click below to sign in. This link expires in <strong>15 minutes</strong> and works once only.</p>
  <p style="margin: 32px 0;">
    <a href="{link}"
       style="background: #f59e0b; color: #fff; padding: 14px 28px; border-radius: 8px;
              text-decoration: none; font-weight: bold; font-size: 16px;">
      Sign In to {app}
    </a>
  </p>
  <p style="color: #666; font-size: 13px;">
    Or copy this link: <a href="{link}">{link}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
  <p style="color: #999; font-size: 12px;">
    If you didn't request this, no action is needed — your account is safe.
  </p>
</body>
</html>"#,
            app = self.app_name,
            link = link,
        );

        self.send(to_email, &subject, text, html).await
    }

    /// Send a waitlist promotion notification.
    #[allow(dead_code)]
    pub async fn
 send_waitlist_promotion(
        &self,
        to_email: &str,
        shift_title: &str,
        shift_date: &str,
        confirm_url: &str,
        decline_url: &str,
    ) -> Result<()> {
        let subject = format!("A spot opened up — {}", shift_title);
        let text = format!(
            "Great news! A spot opened up on the {title} shift ({date}).\n\nConfirm: {confirm}\nDecline: {decline}\n\nYou have 48 hours to respond.",
            title = shift_title, date = shift_date,
            confirm = confirm_url, decline = decline_url,
        );
        let html = format!(
            r#"<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
  <h2 style="color: #d97706;">☀️ A spot opened up!</h2>
  <p>A slot on <strong>{title}</strong> ({date}) is now available for you.</p>
  <p style="margin: 32px 0;">
    <a href="{confirm}"
       style="background: #10b981; color: #fff; padding: 12px 24px; border-radius: 8px;
              text-decoration: none; font-weight: bold; margin-right: 12px;">
      ✓ Confirm
    </a>
    <a href="{decline}"
       style="background: #ef4444; color: #fff; padding: 12px 24px; border-radius: 8px;
              text-decoration: none; font-weight: bold;">
      ✗ Decline
    </a>
  </p>
  <p style="color: #666; font-size: 13px;">You have 48 hours to respond before the next person on the waitlist is notified.</p>
</body>
</html>"#,
            title = shift_title, date = shift_date,
            confirm = confirm_url, decline = decline_url,
        );

        self.send(to_email, &subject, text, html).await
    }

    /// Send a post-shift survey prompt.
    #[allow(dead_code)]
    pub async fn send_survey_prompt(
        &self,
        to_email: &str,
        shift_title: &str,
        survey_url: &str,
    ) -> Result<()> {
        let subject = format!("How did {} go? Share your feedback ☀️", shift_title);
        let text = format!(
            "We'd love to hear about your recent visit!\n\n{survey_url}\n\nThank you for the joy you bring.",
            survey_url = survey_url,
        );
        let html = format!(
            r#"<!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
    <h2 style="color: #d97706;">☀️ How did it go?</h2>
    <p>Thank you for your visit to <strong>{title}</strong>! Your feedback helps us keep improving.</p>
    <p style="margin: 32px 0;">
    <a href="{url}"
       style="background: #f59e0b; color: #fff; padding: 14px 28px; border-radius: 8px;
              text-decoration: none; font-weight: bold;">
      Share My Feedback
    </a>
    </p>
    </body>
    </html>"#,
            title = shift_title, url = survey_url,
        );

        self.send(to_email, &subject, text, html).await
    }

    /// Send assessment scheduled notification.
    pub async fn send_assessment_scheduled(
        &self,
        to_email: &str,
        dog_name: &str,
        date: &str,
        time: &str,
        location: &str,
    ) -> Result<()> {
        let subject = format!("Dog Assessment Scheduled: {}", dog_name);
        let text = format!(
            "Your assessment for {dog_name} has been scheduled!\n\nDate: {date}\nTime: {time}\nLocation: {location}\n\nWe look forward to meeting you and your dog.",
            dog_name = dog_name, date = date, time = time, location = location,
        );
        let html = format!(
            r#"<!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
    <h2 style="color: #d97706;">☀️ Assessment Scheduled!</h2>
    <p>Your in-person evaluation for <strong>{dog_name}</strong> is confirmed.</p>
    <div style="background: #fdfcea; padding: 24px; border-radius: 12px; margin: 32px 0;">
    <p style="margin: 0 0 12px 0;"><strong>Date:</strong> {date}</p>
    <p style="margin: 0 0 12px 0;"><strong>Time:</strong> {time}</p>
    <p style="margin: 0;"><strong>Location:</strong> {location}</p>
    </div>
    <p style="color: #666; font-size: 13px;">Please arrive 5-10 minutes early. Don't forget your dog's favorite treats!</p>
    </body>
    </html>"#,
            dog_name = dog_name, date = date, time = time, location = location,
        );

        self.send(to_email, &subject, text, html).await
    }


    /// Notify a volunteer they have been promoted from the waitlist.
    pub async fn send_waitlist_promoted(
        &self,
        to_email: &str,
        volunteer_name: &str,
        shift_title: &str,
        agency_name: &str,
        shift_date: &str,
        confirm_url: &str,
        decline_url: &str,
        deadline_formatted: &str,
    ) -> Result<()> {
        let subject = format!("A spot opened up for you at {}!", agency_name);
        let text = format!(
            "Hi {volunteer_name},\n\nA spot has opened up for the visit to {agency_name} ({shift_title}) on {shift_date}.\n\nPlease confirm your spot by {deadline_formatted}:\n\nConfirm: {confirm_url}\nCan't make it: {decline_url}\n\nIf we don't hear from you by the deadline, the spot will be offered to the next volunteer.",
        );
        let html = format!(
            r#"<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
  <h2 style="color: #d97706;">☀️ A spot opened up for you!</h2>
  <p>Hi <strong>{volunteer_name}</strong>,</p>
  <p>A spot has opened up for the therapy dog visit to <strong>{agency_name}</strong> — <em>{shift_title}</em> on <strong>{shift_date}</strong>.</p>
  <p>Please confirm by <strong>{deadline_formatted}</strong>:</p>
  <p style="margin: 32px 0; display: flex; gap: 12px;">
    <a href="{confirm_url}"
       style="background: #16a34a; color: #fff; padding: 14px 28px; border-radius: 8px;
              text-decoration: none; font-weight: bold; margin-right: 12px;">
      ✓ Confirm My Spot
    </a>
    <a href="{decline_url}"
       style="background: #fff; color: #6b7280; padding: 14px 28px; border-radius: 8px;
              text-decoration: none; border: 1px solid #e5e7eb; font-weight: bold;">
      Can't Make It
    </a>
  </p>
  <p style="color: #6b7280; font-size: 13px;">If we don't hear from you by the deadline, the spot will be offered to the next volunteer.</p>
</body>
</html>"#,
        );
        self.send(to_email, &subject, text, html).await
    }

    /// Notify volunteer admins that a shift slot is unfilled with no waitlist.
    pub async fn send_shift_slot_unfilled(
        &self,
        to_email: &str,
        shift_title: &str,
        agency_name: &str,
        shift_date: &str,
        manage_url: &str,
    ) -> Result<()> {
        let subject = format!("Action needed: Unfilled slot at {} on {}", agency_name, shift_date);
        let text = format!(
            "A slot for {shift_title} at {agency_name} on {shift_date} is unfilled and no volunteers remain on the waitlist.\n\nManage the shift: {manage_url}",
        );
        let html = format!(
            r#"<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
  <h2 style="color: #dc2626;">⚠️ Unfilled shift slot</h2>
  <p>A slot for <strong>{shift_title}</strong> at <strong>{agency_name}</strong> on <strong>{shift_date}</strong> is unfilled and the waitlist is empty.</p>
  <p style="margin: 32px 0;">
    <a href="{manage_url}"
       style="background: #4f46e5; color: #fff; padding: 14px 28px; border-radius: 8px;
              text-decoration: none; font-weight: bold;">
      Manage Shift
    </a>
  </p>
</body>
</html>"#,
        );
        self.send(to_email, &subject, text, html).await
    }

    async fn send(&self, to: &str, subject: &str, text: String, html: String) -> Result<()> {
        if !self.smtp_enabled {
            tracing::info!(to, subject, "📨 [DEV] Email suppressed — SMTP not configured");
            return Ok(());
        }

        let creds = Credentials::new(self.smtp_username.clone(), self.smtp_password.clone());
        let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&self.smtp_host)
            .context("Invalid SMTP host")?
            .credentials(creds)
            .port(self.smtp_port)
            .build();

        let from: Mailbox = format!("{} <{}>", self.from_name, self.from)
            .parse()
            .context("Invalid from address")?;
        let to_mailbox: Mailbox = to.parse().context("Invalid to address")?;

        let email = Message::builder()
            .from(from)
            .to(to_mailbox)
            .subject(subject)
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
            .context("SMTP send failed")?;

        Ok(())
    }
}

