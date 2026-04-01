//! Passkey (WebAuthn) authentication via webauthn-rs 0.5.
//!
//! Two flows:
//!   Registration:  /auth/passkey/register/start  →  /auth/passkey/register/finish
//!   Authentication:/auth/passkey/login/start     →  /auth/passkey/login/finish
//!
//! Challenge state (PasskeyRegistration / PasskeyAuthentication) is serialized
//! (via danger-allow-state-serialisation feature) and stored in Rocket's
//! encrypted private cookie for the duration of the ceremony.

use anyhow::Context as _;
use webauthn_rs::prelude::*;

/// Build the Webauthn instance from config.
/// Created once at startup and stored as Rocket managed state.
pub fn build_webauthn(rp_id: &str, rp_origin: &str) -> anyhow::Result<Webauthn> {
    let origin = Url::parse(rp_origin).context("Invalid RP origin URL")?;
    let builder = WebauthnBuilder::new(rp_id, &origin)
        .context("WebauthnBuilder::new failed")?
        .rp_name("Sunshine Volunteers");

    builder.build().context("Webauthn::build failed")
}

/// Wrapper stored as Rocket managed state.
pub struct WebauthnState(pub Webauthn);
