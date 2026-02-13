//! Rust Annotation Examples for collab-claude-code
//!
//! This file demonstrates all annotation patterns supported by the
//! @collab system for trust level management.
//!
//! Rust uses brace-based scope detection, so annotations automatically
//! apply to the entire function/impl block following them.

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use thiserror::Error;

// ============================================
// SINGLE-LINE ANNOTATIONS
// ============================================

// @collab trust="READ_ONLY" owner="security-team"
pub fn validate_jwt(token: &str, secret: &[u8]) -> Result<Claims, AuthError> {
    // This entire function is READ_ONLY
    // Claude cannot modify this code directly
    let validation = Validation::default();
    let key = DecodingKey::from_secret(secret);

    let token_data = decode::<Claims>(token, &key, &validation)
        .map_err(|e| AuthError::InvalidToken(e.to_string()))?;

    if token_data.claims.exp < Utc::now().timestamp() as usize {
        return Err(AuthError::TokenExpired);
    }

    Ok(token_data.claims)
}

// @collab trust="SUGGEST_ONLY" owner="payments-team"
pub async fn process_payment(
    client: &StripeClient,
    amount: i64,
    card_token: &str,
) -> Result<PaymentResult, PaymentError> {
    // Claude must create a proposal to modify this function

    let charge = client
        .charges()
        .create(ChargeParams {
            amount,
            currency: "usd".to_string(),
            source: card_token.to_string(),
        })
        .await
        .map_err(|e| PaymentError::ChargeFailed(e.to_string()))?;

    Ok(PaymentResult {
        success: true,
        charge_id: charge.id,
    })
}

// @collab trust="AUTONOMOUS"
pub fn format_currency(amount: f64) -> String {
    // Claude can freely modify this function
    format!("${:.2}", amount)
}

// ============================================
// MULTI-LINE ANNOTATIONS (attributes merge)
// ============================================

// @collab trust="SUGGEST_ONLY"
// @collab intent="Implement user authentication flow"
// @collab owner="auth-team"
pub async fn authenticate_user(
    db: &Database,
    email: &str,
    password: &str,
    secret: &[u8],
) -> Result<AuthResult, AuthError> {
    // All @collab attributes are merged and applied to this function

    let user = db
        .users()
        .find_by_email(email)
        .await
        .map_err(|_| AuthError::UserNotFound)?
        .ok_or(AuthError::UserNotFound)?;

    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|_| AuthError::InvalidPassword)?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| AuthError::InvalidPassword)?;

    let claims = Claims {
        sub: user.id.clone(),
        exp: (Utc::now() + Duration::hours(24)).timestamp() as usize,
        iat: Utc::now().timestamp() as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret),
    )
    .map_err(|e| AuthError::TokenGenerationFailed(e.to_string()))?;

    Ok(AuthResult { user, token })
}

// @collab trust="SUGGEST_ONLY"
// @collab intent="Rate limiting for API endpoints"
// @collab constraints=["Must not block legitimate traffic", "Must log violations"]
pub struct RateLimiter {
    requests: Arc<Mutex<HashMap<String, Vec<u64>>>>,
    max_requests: usize,
    window_ms: u64,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window_ms: u64) -> Self {
        Self {
            requests: Arc::new(Mutex::new(HashMap::new())),
            max_requests,
            window_ms,
        }
    }

    /// Check if a client is within rate limits.
    /// Constraints document requirements that must be preserved.
    pub fn check(&self, client_id: &str) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let window_start = now.saturating_sub(self.window_ms);

        let mut requests = self.requests.lock().unwrap();
        let timestamps = requests.entry(client_id.to_string()).or_default();

        // Remove old timestamps
        timestamps.retain(|&t| t > window_start);

        if timestamps.len() >= self.max_requests {
            eprintln!("Rate limit exceeded: {}", client_id);
            return false;
        }

        timestamps.push(now);
        true
    }
}

// ============================================
// BLOCK ANNOTATIONS (explicit regions)
// ============================================

// @collab:begin trust="READ_ONLY" owner="crypto-team"

/// AES-256-GCM encryption service.
pub struct EncryptionService {
    cipher: Aes256Gcm,
}

impl EncryptionService {
    pub fn new(key: &[u8; 32]) -> Self {
        Self {
            cipher: Aes256Gcm::new(key.into()),
        }
    }

    /// Encrypt plaintext using AES-256-GCM.
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<EncryptedData, CryptoError> {
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext)
            .map_err(|_| CryptoError::EncryptionFailed)?;

        Ok(EncryptedData {
            nonce: hex::encode(nonce_bytes),
            data: hex::encode(ciphertext),
        })
    }

    /// Decrypt data using AES-256-GCM.
    pub fn decrypt(&self, encrypted: &EncryptedData) -> Result<Vec<u8>, CryptoError> {
        let nonce_bytes = hex::decode(&encrypted.nonce)
            .map_err(|_| CryptoError::InvalidNonce)?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = hex::decode(&encrypted.data)
            .map_err(|_| CryptoError::InvalidCiphertext)?;

        self.cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|_| CryptoError::DecryptionFailed)
    }
}

/// Hash a password using Argon2.
pub fn hash_password(password: &str) -> Result<String, CryptoError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| CryptoError::HashingFailed)?;

    Ok(hash.to_string())
}

/// Verify a password against its hash.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, CryptoError> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|_| CryptoError::InvalidHash)?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

// @collab:end

// @collab:begin trust="SUGGEST_ONLY" intent="Database transaction handling"

/// Execute a function within a database transaction.
pub async fn with_transaction<T, F, Fut>(
    db: &Database,
    f: F,
) -> Result<T, TransactionError>
where
    F: FnOnce(Transaction) -> Fut,
    Fut: std::future::Future<Output = Result<T, TransactionError>>,
{
    let tx = db.begin_transaction().await?;

    match f(tx.clone()).await {
        Ok(result) => {
            tx.commit().await?;
            Ok(result)
        }
        Err(e) => {
            tx.rollback().await?;
            Err(e)
        }
    }
}

/// Transfer funds between accounts atomically.
pub async fn transfer_funds(
    db: &Database,
    from_id: &str,
    to_id: &str,
    amount: i64,
) -> Result<TransferResult, TransactionError> {
    with_transaction(db, |tx| async move {
        let from_account = tx
            .accounts()
            .find_by_id_for_update(from_id)
            .await?
            .ok_or(TransactionError::AccountNotFound)?;

        let to_account = tx
            .accounts()
            .find_by_id_for_update(to_id)
            .await?
            .ok_or(TransactionError::AccountNotFound)?;

        if from_account.balance < amount {
            return Err(TransactionError::InsufficientFunds);
        }

        tx.accounts()
            .update_balance(from_id, from_account.balance - amount)
            .await?;
        tx.accounts()
            .update_balance(to_id, to_account.balance + amount)
            .await?;

        Ok(TransferResult {
            success: true,
            transaction_id: uuid::Uuid::new_v4().to_string(),
        })
    })
    .await
}

// @collab:end

// ============================================
// STRUCT WITH MIXED TRUST LEVELS
// ============================================

// @collab:begin trust="SUPERVISED"

/// User management service with mixed trust levels.
pub struct UserService {
    db: Database,
    audit_log: AuditLog,
}

impl UserService {
    pub fn new(db: Database, audit_log: AuditLog) -> Self {
        Self { db, audit_log }
    }

    // Inner annotation takes precedence for this method
    // @collab trust="SUGGEST_ONLY" owner="privacy-team"
    pub async fn delete_user(&self, user_id: &str) -> Result<(), UserError> {
        // This method is SUGGEST_ONLY (requires proposal)
        // GDPR compliance - requires human review

        with_transaction(&self.db, |tx| async move {
            tx.user_data().delete_by_user_id(user_id).await?;
            tx.posts().delete_by_author_id(user_id).await?;
            tx.users().delete(user_id).await?;
            Ok(())
        })
        .await
        .map_err(|_| UserError::DeletionFailed)?;

        self.audit_log.record("user_deleted", &[("user_id", user_id)]);

        Ok(())
    }

    // Falls back to block trust level (SUPERVISED)
    pub async fn update_profile(
        &self,
        user_id: &str,
        updates: ProfileUpdates,
    ) -> Result<User, UserError> {
        let mut user = self
            .db
            .users()
            .find_by_id(user_id)
            .await
            .map_err(|_| UserError::NotFound)?
            .ok_or(UserError::NotFound)?;

        if let Some(name) = updates.name {
            user.name = name;
        }
        if let Some(email) = updates.email {
            user.email = email;
        }

        self.db
            .users()
            .update(&user)
            .await
            .map_err(|_| UserError::UpdateFailed)?;

        Ok(user)
    }
}

// @collab:end

// ============================================
// TYPE DEFINITIONS
// ============================================

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug)]
pub struct PaymentResult {
    pub success: bool,
    pub charge_id: String,
}

#[derive(Debug)]
pub struct AuthResult {
    pub user: User,
    pub token: String,
}

#[derive(Debug)]
pub struct EncryptedData {
    pub nonce: String,
    pub data: String,
}

#[derive(Debug)]
pub struct TransferResult {
    pub success: bool,
    pub transaction_id: String,
}

#[derive(Debug, Clone)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub password_hash: String,
}

#[derive(Debug, Default)]
pub struct ProfileUpdates {
    pub name: Option<String>,
    pub email: Option<String>,
}

// Error types
#[derive(Debug, Error)]
pub enum AuthError {
    #[error("User not found")]
    UserNotFound,
    #[error("Invalid password")]
    InvalidPassword,
    #[error("Token expired")]
    TokenExpired,
    #[error("Invalid token: {0}")]
    InvalidToken(String),
    #[error("Token generation failed: {0}")]
    TokenGenerationFailed(String),
}

#[derive(Debug, Error)]
pub enum PaymentError {
    #[error("Charge failed: {0}")]
    ChargeFailed(String),
}

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("Encryption failed")]
    EncryptionFailed,
    #[error("Decryption failed")]
    DecryptionFailed,
    #[error("Hashing failed")]
    HashingFailed,
    #[error("Invalid nonce")]
    InvalidNonce,
    #[error("Invalid ciphertext")]
    InvalidCiphertext,
    #[error("Invalid hash")]
    InvalidHash,
}

#[derive(Debug, Error)]
pub enum TransactionError {
    #[error("Transaction failed")]
    Failed,
    #[error("Account not found")]
    AccountNotFound,
    #[error("Insufficient funds")]
    InsufficientFunds,
}

#[derive(Debug, Error)]
pub enum UserError {
    #[error("User not found")]
    NotFound,
    #[error("Update failed")]
    UpdateFailed,
    #[error("Deletion failed")]
    DeletionFailed,
}

// Placeholder types (would be defined elsewhere)
pub struct Database;
pub struct Transaction;
pub struct AuditLog;
pub struct StripeClient;
pub struct ChargeParams {
    pub amount: i64,
    pub currency: String,
    pub source: String,
}
pub struct Charge {
    pub id: String,
}
pub struct Account {
    pub id: String,
    pub balance: i64,
}

impl Database {
    pub fn users(&self) -> UserRepository { unimplemented!() }
    pub async fn begin_transaction(&self) -> Result<Transaction, TransactionError> { unimplemented!() }
}

impl Transaction {
    pub fn accounts(&self) -> AccountRepository { unimplemented!() }
    pub fn users(&self) -> UserRepository { unimplemented!() }
    pub fn posts(&self) -> PostRepository { unimplemented!() }
    pub fn user_data(&self) -> UserDataRepository { unimplemented!() }
    pub async fn commit(&self) -> Result<(), TransactionError> { unimplemented!() }
    pub async fn rollback(&self) -> Result<(), TransactionError> { unimplemented!() }
    pub fn clone(&self) -> Self { unimplemented!() }
}

impl AuditLog {
    pub fn record(&self, _event: &str, _data: &[(&str, &str)]) {}
}

pub struct UserRepository;
pub struct AccountRepository;
pub struct PostRepository;
pub struct UserDataRepository;
