// Package examples demonstrates all annotation patterns supported by
// collab-claude-code for trust level management in Go.
//
// Go uses brace-based scope detection, so annotations automatically
// apply to the entire function/block following them.
package examples

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/time/rate"
)

// ============================================
// SINGLE-LINE ANNOTATIONS
// ============================================

// @collab trust="READ_ONLY" owner="security-team"
func ValidateJWT(tokenString, secretKey string) (*Claims, error) {
	// This entire function is READ_ONLY
	// Claude cannot modify this code directly
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secretKey), nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}

// @collab trust="SUGGEST_ONLY" owner="payments-team"
func ProcessPayment(ctx context.Context, amount int64, cardToken string) (*PaymentResult, error) {
	// Claude must create a proposal to modify this function
	charge, err := stripeClient.Charges.New(&stripe.ChargeParams{
		Amount:   stripe.Int64(amount),
		Currency: stripe.String("usd"),
		Source:   &stripe.SourceParams{Token: stripe.String(cardToken)},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to process payment: %w", err)
	}

	return &PaymentResult{
		Success:  true,
		ChargeID: charge.ID,
	}, nil
}

// @collab trust="AUTONOMOUS"
func FormatCurrency(amount float64) string {
	// Claude can freely modify this function
	return fmt.Sprintf("$%.2f", amount)
}

// ============================================
// MULTI-LINE ANNOTATIONS (attributes merge)
// ============================================

// @collab trust="SUGGEST_ONLY"
// @collab intent="Implement user authentication flow"
// @collab owner="auth-team"
func AuthenticateUser(ctx context.Context, email, password string) (*AuthResult, error) {
	// All @collab attributes are merged and applied to this function
	user, err := db.Users.FindByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("invalid password")
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &Claims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})

	tokenString, err := token.SignedString([]byte(secretKey))
	if err != nil {
		return nil, fmt.Errorf("failed to sign token: %w", err)
	}

	return &AuthResult{
		User:  user,
		Token: tokenString,
	}, nil
}

// @collab trust="SUGGEST_ONLY"
// @collab intent="Rate limiting middleware"
// @collab constraints=["Must not block legitimate traffic", "Must log violations"]
func RateLimitMiddleware(maxRequests int, window time.Duration) func(http.Handler) http.Handler {
	// Constraints document requirements that must be preserved
	limiter := rate.NewLimiter(rate.Every(window/time.Duration(maxRequests)), maxRequests)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !limiter.Allow() {
				log.Printf("Rate limit exceeded: %s", r.RemoteAddr)
				http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ============================================
// BLOCK ANNOTATIONS (explicit regions)
// ============================================

// @collab:begin trust="READ_ONLY" owner="crypto-team"

// EncryptionService provides AES-256-GCM encryption.
type EncryptionService struct {
	key []byte
}

// NewEncryptionService creates a new encryption service with the given key.
func NewEncryptionService(key []byte) (*EncryptionService, error) {
	if len(key) != 32 {
		return nil, errors.New("key must be 32 bytes")
	}
	return &EncryptionService{key: key}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM.
func (s *EncryptionService) Encrypt(plaintext []byte) (*EncryptedData, error) {
	block, err := aes.NewCipher(s.key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	return &EncryptedData{
		Nonce: hex.EncodeToString(nonce),
		Data:  hex.EncodeToString(ciphertext),
	}, nil
}

// Decrypt decrypts data using AES-256-GCM.
func (s *EncryptionService) Decrypt(encrypted *EncryptedData) ([]byte, error) {
	block, err := aes.NewCipher(s.key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce, err := hex.DecodeString(encrypted.Nonce)
	if err != nil {
		return nil, fmt.Errorf("failed to decode nonce: %w", err)
	}

	ciphertext, err := hex.DecodeString(encrypted.Data)
	if err != nil {
		return nil, fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	return plaintext, nil
}

// GenerateKeyPair generates an ECDSA P-256 key pair.
func GenerateKeyPair() (*ecdsa.PrivateKey, error) {
	return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
}

// SignMessage signs a message with an ECDSA private key.
func SignMessage(key *ecdsa.PrivateKey, message []byte) ([]byte, error) {
	hash := sha256.Sum256(message)
	return ecdsa.SignASN1(rand.Reader, key, hash[:])
}

// VerifySignature verifies an ECDSA signature.
func VerifySignature(pub *ecdsa.PublicKey, message, sig []byte) bool {
	hash := sha256.Sum256(message)
	return ecdsa.VerifyASN1(pub, hash[:], sig)
}

// @collab:end

// @collab:begin trust="SUGGEST_ONLY" intent="Database transaction handling"

// WithTransaction executes a function within a database transaction.
func WithTransaction(ctx context.Context, db *sql.DB, fn func(tx *sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("failed to rollback: %v (original error: %w)", rbErr, err)
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	return nil
}

// TransferFunds transfers funds between accounts atomically.
func TransferFunds(ctx context.Context, db *sql.DB, fromID, toID string, amount int64) (*TransferResult, error) {
	var result TransferResult

	err := WithTransaction(ctx, db, func(tx *sql.Tx) error {
		// Get source account
		var fromBalance int64
		err := tx.QueryRowContext(ctx,
			"SELECT balance FROM accounts WHERE id = $1 FOR UPDATE", fromID,
		).Scan(&fromBalance)
		if err != nil {
			return fmt.Errorf("failed to get source account: %w", err)
		}

		if fromBalance < amount {
			return errors.New("insufficient funds")
		}

		// Debit source account
		_, err = tx.ExecContext(ctx,
			"UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, fromID,
		)
		if err != nil {
			return fmt.Errorf("failed to debit source: %w", err)
		}

		// Credit destination account
		_, err = tx.ExecContext(ctx,
			"UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, toID,
		)
		if err != nil {
			return fmt.Errorf("failed to credit destination: %w", err)
		}

		result.Success = true
		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}

// @collab:end

// ============================================
// STRUCT WITH MIXED TRUST LEVELS
// ============================================

// @collab:begin trust="SUPERVISED"

// UserService handles user management operations.
type UserService struct {
	db       *sql.DB
	auditLog *AuditLog
	mu       sync.Mutex
}

// NewUserService creates a new user service.
func NewUserService(db *sql.DB, auditLog *AuditLog) *UserService {
	return &UserService{
		db:       db,
		auditLog: auditLog,
	}
}

// @collab trust="SUGGEST_ONLY" owner="privacy-team"
func (s *UserService) DeleteUser(ctx context.Context, userID string) error {
	// This method is SUGGEST_ONLY (requires proposal)
	// GDPR compliance - requires human review
	s.mu.Lock()
	defer s.mu.Unlock()

	return WithTransaction(ctx, s.db, func(tx *sql.Tx) error {
		// Delete user data
		if _, err := tx.ExecContext(ctx, "DELETE FROM user_data WHERE user_id = $1", userID); err != nil {
			return fmt.Errorf("failed to delete user data: %w", err)
		}

		// Delete user posts
		if _, err := tx.ExecContext(ctx, "DELETE FROM posts WHERE author_id = $1", userID); err != nil {
			return fmt.Errorf("failed to delete user posts: %w", err)
		}

		// Delete user account
		if _, err := tx.ExecContext(ctx, "DELETE FROM users WHERE id = $1", userID); err != nil {
			return fmt.Errorf("failed to delete user: %w", err)
		}

		// Log deletion
		s.auditLog.Record("user_deleted", map[string]string{"user_id": userID})

		return nil
	})
}

// UpdateProfile updates a user's profile (falls back to block trust level: SUPERVISED).
func (s *UserService) UpdateProfile(ctx context.Context, userID string, updates map[string]interface{}) (*User, error) {
	// This method inherits SUPERVISED from the block
	// Build update query dynamically
	query := "UPDATE users SET "
	args := make([]interface{}, 0)
	i := 1

	for key, value := range updates {
		if i > 1 {
			query += ", "
		}
		query += fmt.Sprintf("%s = $%d", key, i)
		args = append(args, value)
		i++
	}

	query += fmt.Sprintf(" WHERE id = $%d RETURNING *", i)
	args = append(args, userID)

	var user User
	err := s.db.QueryRowContext(ctx, query, args...).Scan(&user.ID, &user.Email, &user.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}

	return &user, nil
}

// @collab:end

// ============================================
// TYPE DEFINITIONS
// ============================================

// Claims represents JWT claims.
type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

// PaymentResult represents the result of a payment operation.
type PaymentResult struct {
	Success  bool
	ChargeID string
}

// AuthResult represents the result of authentication.
type AuthResult struct {
	User  *User
	Token string
}

// EncryptedData represents encrypted data with its nonce.
type EncryptedData struct {
	Nonce string
	Data  string
}

// TransferResult represents the result of a fund transfer.
type TransferResult struct {
	Success       bool
	TransactionID string
}

// User represents a user in the system.
type User struct {
	ID           string
	Email        string
	Name         string
	PasswordHash string
}

// AuditLog handles audit logging.
type AuditLog struct{}

// Record logs an audit event.
func (a *AuditLog) Record(event string, data map[string]string) {
	log.Printf("AUDIT: %s %v", event, data)
}
