//! Flash authorization token generation and validation.
//! Ported from electron/flashSafety.ts — HMAC-SHA256 token section.
//!
//! Token format: `flashconf.<session_id>.<base64url_payload>.<base64url_signature>`
//! Payload is a JSON-serialized FlashConfirmationClaims, stable-sorted by key.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::error::AppError;
use super::disk_identity::DiskIdentityFingerprint;

type HmacSha256 = Hmac<Sha256>;

/// TTL for flash confirmation tokens: 5 minutes.
pub const FLASH_CONFIRMATION_TTL_MS: i64 = 5 * 60 * 1000;

/// Current token version.
pub const FLASH_CONFIRMATION_TOKEN_VERSION: u32 = 2;

/// Token prefix for format validation.
const TOKEN_PREFIX: &str = "flashconf";

/// Claims embedded in a flash confirmation token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashConfirmationClaims {
    pub version: u32,
    pub session_id: String,
    pub nonce: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub device: String,
    pub disk_fingerprint: DiskIdentityFingerprint,
    pub efi_state_hash: String,
    pub payload_state_hash: Option<String>,
    pub hardware_fingerprint: String,
}

/// Result of token verification.
#[derive(Debug, Clone)]
pub enum TokenVerifyResult {
    Pending(FlashConfirmationClaims),
    Malformed,
    SignatureInvalid,
    SessionMismatch,
}

/// Validation result with human-readable reason.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashConfirmationValidation {
    pub valid: bool,
    pub reason: Option<String>,
    pub code: Option<String>,
}

/// Holds the secret key and session ID for flash token operations.
/// One instance per app lifetime.
pub struct FlashSecurityContext {
    secret: Vec<u8>,
    session_id: String,
    consumed_tokens: RwLock<Vec<ConsumedToken>>,
}

struct ConsumedToken {
    nonce: String,
    consumed_at: i64,
}

/// Retention for consumed tokens: 30 minutes.
const CONSUMED_RETENTION_MS: i64 = 30 * 60 * 1000;

impl FlashSecurityContext {
    /// Create a new security context with a random 32-byte secret.
    pub fn new(session_id: String) -> Arc<Self> {
        let mut secret = vec![0u8; 32];
        rand::rng().fill(&mut secret[..]);
        info!(session_id = %session_id, "FlashSecurityContext initialized");

        Arc::new(Self {
            secret,
            session_id,
            consumed_tokens: RwLock::new(Vec::new()),
        })
    }

    /// Get the session ID.
    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    /// Generate a flash confirmation token.
    pub fn generate_token(
        &self,
        device: &str,
        disk_fingerprint: DiskIdentityFingerprint,
        efi_state_hash: &str,
        payload_state_hash: Option<&str>,
        hardware_fingerprint: &str,
    ) -> Result<(String, i64), AppError> {
        let now = chrono::Utc::now().timestamp_millis();
        let expires_at = now + FLASH_CONFIRMATION_TTL_MS;

        let nonce = generate_nonce();

        let claims = FlashConfirmationClaims {
            version: FLASH_CONFIRMATION_TOKEN_VERSION,
            session_id: self.session_id.clone(),
            nonce,
            issued_at: now,
            expires_at,
            device: device.to_string(),
            disk_fingerprint,
            efi_state_hash: efi_state_hash.to_string(),
            payload_state_hash: payload_state_hash.map(String::from),
            hardware_fingerprint: hardware_fingerprint.to_string(),
        };

        let token = sign_claims(&self.secret, &claims)?;

        info!(
            device = %device,
            expires_at = %expires_at,
            "Flash confirmation token generated"
        );

        Ok((token, expires_at))
    }

    /// Verify a flash confirmation token.
    /// Checks: format, signature, session, expiry.
    pub async fn verify_token(&self, token: &str) -> Result<FlashConfirmationValidation, AppError> {
        let result = verify_token_inner(token, &self.secret, &self.session_id);

        match result {
            TokenVerifyResult::Malformed => {
                warn!("Flash token verification: malformed");
                Ok(FlashConfirmationValidation {
                    valid: false,
                    reason: Some("Token is malformed or has invalid format.".into()),
                    code: Some("CONFIRMATION_MALFORMED".into()),
                })
            }
            TokenVerifyResult::SignatureInvalid => {
                warn!("Flash token verification: signature invalid");
                Ok(FlashConfirmationValidation {
                    valid: false,
                    reason: Some("Token signature does not match. Possible tampering.".into()),
                    code: Some("CONFIRMATION_SIGNATURE_INVALID".into()),
                })
            }
            TokenVerifyResult::SessionMismatch => {
                warn!("Flash token verification: session mismatch");
                Ok(FlashConfirmationValidation {
                    valid: false,
                    reason: Some("Token belongs to a different session. Re-confirm.".into()),
                    code: Some("CONFIRMATION_SESSION_CHANGED".into()),
                })
            }
            TokenVerifyResult::Pending(claims) => {
                // Check consumed
                {
                    let consumed = self.consumed_tokens.read().await;
                    if consumed.iter().any(|c| c.nonce == claims.nonce) {
                        return Ok(FlashConfirmationValidation {
                            valid: false,
                            reason: Some("Token has already been consumed.".into()),
                            code: Some("CONFIRMATION_CONSUMED".into()),
                        });
                    }
                }

                // Check expiry
                let now = chrono::Utc::now().timestamp_millis();
                if now > claims.expires_at {
                    return Ok(FlashConfirmationValidation {
                        valid: false,
                        reason: Some("Token has expired. Re-confirm.".into()),
                        code: Some("CONFIRMATION_EXPIRED".into()),
                    });
                }

                info!("Flash token verification: valid");
                Ok(FlashConfirmationValidation {
                    valid: true,
                    reason: None,
                    code: None,
                })
            }
        }
    }

    /// Verify token and return the claims if valid.
    pub async fn verify_and_extract(&self, token: &str) -> Result<FlashConfirmationClaims, AppError> {
        let result = verify_token_inner(token, &self.secret, &self.session_id);
        match result {
            TokenVerifyResult::Pending(claims) => {
                // Check consumed
                {
                    let consumed = self.consumed_tokens.read().await;
                    if consumed.iter().any(|c| c.nonce == claims.nonce) {
                        return Err(AppError::new("CONFIRMATION_CONSUMED", "Token has already been consumed"));
                    }
                }
                // Check expiry
                let now = chrono::Utc::now().timestamp_millis();
                if now > claims.expires_at {
                    return Err(AppError::new("CONFIRMATION_EXPIRED", "Token has expired"));
                }
                Ok(claims)
            }
            TokenVerifyResult::Malformed => {
                Err(AppError::new("CONFIRMATION_MALFORMED", "Token is malformed"))
            }
            TokenVerifyResult::SignatureInvalid => {
                Err(AppError::new("CONFIRMATION_SIGNATURE_INVALID", "Token signature invalid"))
            }
            TokenVerifyResult::SessionMismatch => {
                Err(AppError::new("CONFIRMATION_SESSION_CHANGED", "Token session mismatch"))
            }
        }
    }

    /// Verify token and atomically mark its nonce as consumed.
    pub async fn verify_and_consume(&self, token: &str) -> Result<FlashConfirmationClaims, AppError> {
        let result = verify_token_inner(token, &self.secret, &self.session_id);
        match result {
            TokenVerifyResult::Pending(claims) => {
                let now = chrono::Utc::now().timestamp_millis();
                let mut consumed = self.consumed_tokens.write().await;

                consumed.retain(|c| now - c.consumed_at < CONSUMED_RETENTION_MS);

                if consumed.iter().any(|c| c.nonce == claims.nonce) {
                    return Err(AppError::new("CONFIRMATION_CONSUMED", "Token has already been consumed"));
                }

                if now > claims.expires_at {
                    return Err(AppError::new("CONFIRMATION_EXPIRED", "Token has expired"));
                }

                consumed.push(ConsumedToken {
                    nonce: claims.nonce.clone(),
                    consumed_at: now,
                });

                info!(nonce = %claims.nonce, "Flash confirmation token verified and consumed");
                Ok(claims)
            }
            TokenVerifyResult::Malformed => {
                Err(AppError::new("CONFIRMATION_MALFORMED", "Token is malformed"))
            }
            TokenVerifyResult::SignatureInvalid => {
                Err(AppError::new("CONFIRMATION_SIGNATURE_INVALID", "Token signature invalid"))
            }
            TokenVerifyResult::SessionMismatch => {
                Err(AppError::new("CONFIRMATION_SESSION_CHANGED", "Token session mismatch"))
            }
        }
    }

    /// Mark a token as consumed (by nonce). Prunes old entries.
    pub async fn consume_token(&self, nonce: &str) {
        let now = chrono::Utc::now().timestamp_millis();
        let mut consumed = self.consumed_tokens.write().await;

        // Prune old
        consumed.retain(|c| now - c.consumed_at < CONSUMED_RETENTION_MS);

        consumed.push(ConsumedToken {
            nonce: nonce.to_string(),
            consumed_at: now,
        });

        info!(nonce = %nonce, "Flash confirmation token consumed");
    }
}

/// Generate a 24-character hex nonce.
fn generate_nonce() -> String {
    let mut bytes = [0u8; 12];
    rand::rng().fill(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Stable-serialize claims to JSON with sorted keys (BTreeMap).
fn serialize_claims_stable(claims: &FlashConfirmationClaims) -> Result<String, AppError> {
    let mut map = BTreeMap::new();
    map.insert("version", serde_json::to_value(claims.version)?);
    map.insert("sessionId", serde_json::to_value(&claims.session_id)?);
    map.insert("nonce", serde_json::to_value(&claims.nonce)?);
    map.insert("issuedAt", serde_json::to_value(claims.issued_at)?);
    map.insert("expiresAt", serde_json::to_value(claims.expires_at)?);
    map.insert("device", serde_json::to_value(&claims.device)?);
    map.insert("diskFingerprint", serde_json::to_value(&claims.disk_fingerprint)?);
    map.insert("efiStateHash", serde_json::to_value(&claims.efi_state_hash)?);
    map.insert("payloadStateHash", serde_json::to_value(&claims.payload_state_hash)?);
    map.insert("hardwareFingerprint", serde_json::to_value(&claims.hardware_fingerprint)?);
    serde_json::to_string(&map).map_err(|e| AppError::new("SERIALIZE_ERROR", e.to_string()))
}

/// Sign claims with HMAC-SHA256.
fn sign_claims(secret: &[u8], claims: &FlashConfirmationClaims) -> Result<String, AppError> {
    let serialized = serialize_claims_stable(claims)?;
    let payload = URL_SAFE_NO_PAD.encode(serialized.as_bytes());

    let mut mac = HmacSha256::new_from_slice(secret)
        .map_err(|e| AppError::new("HMAC_ERROR", e.to_string()))?;
    mac.update(payload.as_bytes());
    let signature = mac.finalize().into_bytes();
    let sig_b64 = URL_SAFE_NO_PAD.encode(&signature);

    Ok(format!(
        "{}.{}.{}.{}",
        TOKEN_PREFIX, claims.session_id, payload, sig_b64
    ))
}

/// Verify token structure and signature. Does NOT check expiry or consumed state.
fn verify_token_inner(
    token: &str,
    secret: &[u8],
    current_session_id: &str,
) -> TokenVerifyResult {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 4 || parts[0] != TOKEN_PREFIX {
        return TokenVerifyResult::Malformed;
    }

    let header_session_id = parts[1];
    let payload = parts[2];
    let provided_sig = parts[3];

    // Session check on header
    if header_session_id != current_session_id {
        return TokenVerifyResult::SessionMismatch;
    }

    // Verify HMAC signature
    let mut mac = match HmacSha256::new_from_slice(secret) {
        Ok(m) => m,
        Err(_) => return TokenVerifyResult::Malformed,
    };
    mac.update(payload.as_bytes());
    let expected_sig = mac.finalize().into_bytes();

    let provided_sig_bytes = match URL_SAFE_NO_PAD.decode(provided_sig) {
        Ok(b) => b,
        Err(_) => return TokenVerifyResult::Malformed,
    };

    if provided_sig_bytes.len() != expected_sig.len() {
        return TokenVerifyResult::SignatureInvalid;
    }

    // Constant-time comparison
    let mut diff: u8 = 0;
    for (a, b) in provided_sig_bytes.iter().zip(expected_sig.iter()) {
        diff |= a ^ b;
    }
    if diff != 0 {
        return TokenVerifyResult::SignatureInvalid;
    }

    // Decode payload
    let payload_bytes = match URL_SAFE_NO_PAD.decode(payload) {
        Ok(b) => b,
        Err(_) => return TokenVerifyResult::Malformed,
    };

    let payload_str = match String::from_utf8(payload_bytes) {
        Ok(s) => s,
        Err(_) => return TokenVerifyResult::Malformed,
    };

    let claims: FlashConfirmationClaims = match serde_json::from_str(&payload_str) {
        Ok(c) => c,
        Err(_) => return TokenVerifyResult::Malformed,
    };

    // Session check on claims
    if claims.session_id != current_session_id || claims.session_id != header_session_id {
        return TokenVerifyResult::SessionMismatch;
    }

    if claims.version != FLASH_CONFIRMATION_TOKEN_VERSION {
        return TokenVerifyResult::Malformed;
    }

    if claims.nonce.len() < 16 {
        return TokenVerifyResult::Malformed;
    }

    TokenVerifyResult::Pending(claims)
}
