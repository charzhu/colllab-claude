# collab-claude-code

Human-LLM collaboration tracking for Claude Code — trust boundaries, authorship tracking, and change proposals.

## Overview

`collab-claude-code` enables safe, controlled collaboration between humans and Claude Code by:

- **Trust Levels**: Define which code Claude can edit freely vs. code that requires proposals
- **Inline Annotations**: Mark trust boundaries directly in your source code using `@collab` comments
- **Change Proposals**: For sensitive code, Claude creates proposals instead of direct edits
- **Authorship Tracking**: Track who wrote what code with confidence scores
- **Intent Recording**: Document why code was written for future reference

## Installation

```bash
npm install @charzhu/collab-claude-code
npx collab-claude-code init
```

This installs the MCP server and pre-edit hooks for Claude Code.

## Quick Start

1. **Initialize** your project:
   ```bash
   npx collab-claude-code init
   ```

2. **Configure trust policies** in `.collab/trust.yaml`:
   ```yaml
   default_trust: SUPERVISED
   policies:
     - pattern: "src/core/**"
       trust: SUGGEST_ONLY
       owner: "your-name"
       reason: "Core business logic"
   ```

3. **Add inline annotations** to sensitive code (see [examples](#annotation-examples))

4. **Use Claude Code** normally — it will respect trust boundaries automatically

## Trust Levels

| Level | Behavior | Use Case |
|-------|----------|----------|
| `AUTONOMOUS` | Edit freely | Generated code, tests |
| `SUPERVISED` | Proceed with caution (default) | Most application code |
| `SUGGEST_ONLY` | Must propose changes | Core business logic |
| `READ_ONLY` | Cannot modify | Security-critical code |

### Trust Resolution Order

Trust is resolved in this priority (highest first):

1. **Inline annotations** (`@collab` in code comments)
2. **Region overrides** (specific line ranges in `trust.yaml`)
3. **Pattern policies** (glob patterns in `trust.yaml`)
4. **Default trust level** (project-wide default)

## Annotation Syntax

Annotations use the `@collab` marker in comments. The system supports any comment syntax:

```
// @collab ...     (C, C++, Java, Go, TypeScript, JavaScript, Rust)
#  @collab ...     (Python, Ruby, Shell)
/* @collab ... */  (CSS, multi-line comments)
```

### Supported Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `trust` | `AUTONOMOUS` \| `SUPERVISED` \| `SUGGEST_ONLY` \| `READ_ONLY` | Trust level for this region |
| `owner` | string | Person responsible for this code |
| `intent` | string | Why this code exists |
| `constraints` | array | Requirements the code must satisfy |

## Annotation Examples

### TypeScript / JavaScript

#### Single-line annotation (applies to the following function/block)

```typescript
// @collab trust="READ_ONLY" owner="security-team" reason="Authentication logic"
function validateToken(token: string): boolean {
  // This entire function is READ_ONLY
  const decoded = jwt.verify(token, SECRET_KEY);
  return decoded.exp > Date.now();
}
```

#### Multi-line annotation (consecutive `@collab` lines merge)

```typescript
// @collab trust="SUGGEST_ONLY"
// @collab intent="Implement OAuth2 authorization flow"
// @collab constraints=["Must validate redirect_uri", "Must use PKCE"]
async function authorizeUser(request: OAuthRequest): Promise<AuthResult> {
  // All attributes merged and applied to this function
  const { client_id, redirect_uri, code_verifier } = request;
  // ...
}
```

#### Block annotation (explicit multi-line regions)

```typescript
// @collab:begin trust="READ_ONLY" owner="alice"
async function deleteUser(userId: string): Promise<void> {
  await db.users.delete(userId);
  await logAudit("user_deleted", userId);
}

async function deleteAllUserData(userId: string): Promise<void> {
  await deleteUserPosts(userId);
  await deleteUserComments(userId);
  await deleteUser(userId);
}
// @collab:end
```

### Python

#### Single-line annotation (scope detected by indentation)

```python
# @collab trust="SUGGEST_ONLY" owner="data-team"
def process_payment(amount: float, card_token: str) -> PaymentResult:
    """Process a payment through the payment gateway."""
    # The entire function is SUGGEST_ONLY based on indentation
    validated = validate_card_token(card_token)
    if not validated:
        raise InvalidCardError("Card validation failed")

    return gateway.charge(amount, card_token)


# @collab trust="READ_ONLY" intent="Core encryption routines"
class EncryptionService:
    """Handles all encryption operations."""

    def __init__(self, key: bytes):
        self._key = key

    def encrypt(self, data: bytes) -> bytes:
        return self._cipher.encrypt(data)

    def decrypt(self, data: bytes) -> bytes:
        return self._cipher.decrypt(data)
```

#### Block annotation

```python
# @collab:begin trust="READ_ONLY" owner="security-team"
def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode(), hashed.encode())
# @collab:end
```

### Go

#### Single-line annotation (scope detected by braces)

```go
// @collab trust="READ_ONLY" owner="security-team"
func ValidateJWT(tokenString string) (*Claims, error) {
	// Entire function is READ_ONLY
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
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
```

#### Multi-line annotation with constraints

```go
// @collab trust="SUGGEST_ONLY"
// @collab intent="Rate limiting middleware"
// @collab constraints=["Must not block legitimate traffic", "Must log violations"]
func RateLimitMiddleware(limit int, window time.Duration) func(http.Handler) http.Handler {
	limiter := rate.NewLimiter(rate.Every(window/time.Duration(limit)), limit)

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
```

#### Block annotation

```go
// @collab:begin trust="READ_ONLY" owner="crypto-team"
func GenerateKeyPair() (*ecdsa.PrivateKey, error) {
	return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
}

func SignMessage(key *ecdsa.PrivateKey, message []byte) ([]byte, error) {
	hash := sha256.Sum256(message)
	return ecdsa.SignASN1(rand.Reader, key, hash[:])
}

func VerifySignature(pub *ecdsa.PublicKey, message, sig []byte) bool {
	hash := sha256.Sum256(message)
	return ecdsa.VerifyASN1(pub, hash[:], sig)
}
// @collab:end
```

### Rust

#### Single-line annotation

```rust
// @collab trust="READ_ONLY" owner="security-team"
pub fn verify_signature(public_key: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, CryptoError> {
    // Entire function is READ_ONLY
    let key = PublicKey::from_bytes(public_key)?;
    let sig = Signature::from_bytes(signature)?;
    Ok(key.verify(message, &sig).is_ok())
}
```

#### Block annotation

```rust
// @collab:begin trust="SUGGEST_ONLY" intent="Database connection pooling"
pub struct ConnectionPool {
    pool: Pool<Postgres>,
    max_connections: u32,
}

impl ConnectionPool {
    pub async fn new(database_url: &str, max_connections: u32) -> Result<Self, PoolError> {
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .connect(database_url)
            .await?;

        Ok(Self { pool, max_connections })
    }

    pub async fn acquire(&self) -> Result<PoolConnection<Postgres>, PoolError> {
        self.pool.acquire().await
    }
}
// @collab:end
```

### Java

#### Single-line annotation

```java
// @collab trust="READ_ONLY" owner="security-team"
public class PasswordEncoder {

    private static final int BCRYPT_ROUNDS = 12;

    public String encode(String rawPassword) {
        return BCrypt.hashpw(rawPassword, BCrypt.gensalt(BCRYPT_ROUNDS));
    }

    public boolean matches(String rawPassword, String encodedPassword) {
        return BCrypt.checkpw(rawPassword, encodedPassword);
    }
}
```

#### Multi-line annotation with constraints

```java
// @collab trust="SUGGEST_ONLY"
// @collab intent="Payment processing service"
// @collab constraints=["Must be PCI-DSS compliant", "Must log all transactions"]
@Service
public class PaymentService {

    private final PaymentGateway gateway;
    private final TransactionLogger logger;

    public PaymentResult processPayment(PaymentRequest request) {
        logger.logAttempt(request);

        try {
            PaymentResult result = gateway.charge(request);
            logger.logSuccess(request, result);
            return result;
        } catch (PaymentException e) {
            logger.logFailure(request, e);
            throw e;
        }
    }
}
```

### Ruby

```ruby
# @collab trust="READ_ONLY" owner="security-team"
class EncryptionService
  ALGORITHM = 'aes-256-gcm'

  def initialize(key)
    @key = key
  end

  def encrypt(plaintext)
    cipher = OpenSSL::Cipher.new(ALGORITHM)
    cipher.encrypt
    cipher.key = @key
    iv = cipher.random_iv

    encrypted = cipher.update(plaintext) + cipher.final
    tag = cipher.auth_tag

    { iv: iv, tag: tag, data: encrypted }
  end

  def decrypt(iv:, tag:, data:)
    cipher = OpenSSL::Cipher.new(ALGORITHM)
    cipher.decrypt
    cipher.key = @key
    cipher.iv = iv
    cipher.auth_tag = tag

    cipher.update(data) + cipher.final
  end
end
```

### Shell / Bash

```bash
# @collab trust="READ_ONLY" owner="devops-team" intent="Production deployment script"
deploy_to_production() {
    # This function is READ_ONLY
    local version="$1"

    echo "Deploying version $version to production..."

    # Backup current deployment
    kubectl get deployment app -o yaml > backup.yaml

    # Apply new deployment
    kubectl set image deployment/app app="myregistry/app:$version"

    # Wait for rollout
    kubectl rollout status deployment/app
}
```

## Configuration Files

### `.collab/trust.yaml`

```yaml
# Default trust level for files not matching any policy
default_trust: SUPERVISED

# Pattern-based policies (first match wins)
policies:
  - pattern: "**/generated/**"
    trust: AUTONOMOUS
    reason: "Auto-generated code, can be regenerated"

  - pattern: "**/test/**"
    trust: AUTONOMOUS
    reason: "Test files can be freely modified"

  - pattern: "**/*.test.*"
    trust: AUTONOMOUS
    reason: "Test files can be freely modified"

  - pattern: "**/security/**"
    trust: READ_ONLY
    reason: "Security-critical code requires human modification"

  - pattern: "src/core/**"
    trust: SUGGEST_ONLY
    owner: "backend-team"
    reason: "Core business logic"

  - pattern: "src/payments/**"
    trust: READ_ONLY
    owner: "payments-team"
    reason: "Payment processing - PCI compliance"

# Region-specific overrides (line ranges within files)
regions:
  - file: "src/auth/jwt.ts"
    line_start: 45
    line_end: 89
    trust: READ_ONLY
    reason: "Token verification logic"
```

### `.collab/config.yaml`

```yaml
version: "1.0"
confidence_threshold: 0.7
auto_record_authorship: true
model: "claude-opus-4"
```

## Claude Code Commands

| Command | Description |
|---------|-------------|
| `/collab-init` | Initialize collaboration tracking |
| `/collab-status` | Show project collaboration metrics |
| `/collab-status <file>` | Show file-specific metrics |
| `/collab-proposals` | Review and apply/reject pending proposals |
| `/collab-review` | Pre-commit review with authorship breakdown |

## How It Works

### Pre-Edit Hook

When Claude attempts to edit a file, the pre-edit hook:

1. Parses any `@collab` annotations in the file
2. Checks the trust level for the affected lines
3. **AUTONOMOUS/SUPERVISED**: Allows the edit
4. **SUGGEST_ONLY**: Warns but allows (Claude should create a proposal instead)
5. **READ_ONLY**: Blocks the edit entirely

### Change Proposals

For `SUGGEST_ONLY` regions, Claude creates proposals instead of direct edits:

```yaml
# .collab/proposals/a1b2c3d4.yaml
id: "a1b2c3d4"
created_at: "2024-01-15T10:30:00Z"
author: "claude"
status: "pending"
file_path: "src/core/auth.ts"
description: "Optimize token validation caching"
rationale: "Current implementation validates tokens on every request..."
old_code: |
  async function validateToken(token: string) {
    return await jwt.verify(token, SECRET);
  }
new_code: |
  const tokenCache = new LRU({ max: 1000, ttl: 60000 });

  async function validateToken(token: string) {
    const cached = tokenCache.get(token);
    if (cached) return cached;

    const result = await jwt.verify(token, SECRET);
    tokenCache.set(token, result);
    return result;
  }
confidence: 0.85
risks:
  - "Cache invalidation if secret rotates"
tests_needed:
  - "Test cache expiration"
  - "Test concurrent access"
```

Use `/collab-proposals` to review and apply or reject proposals.

## Directory Structure

```
.collab/
├── trust.yaml          # Trust policies and region overrides
├── config.yaml         # Configuration settings
├── meta/               # Authorship records (.jsonl files)
│   └── src_core_auth.jsonl
├── intents/            # Recorded intent documentation (.yaml)
│   └── src_core_auth.yaml
└── proposals/          # Pending change proposals (.yaml)
    └── a1b2c3d4.yaml
```

## MCP Tools

The package exposes these tools for Claude Code:

| Tool | Description |
|------|-------------|
| `collab_check_trust` | Check if editing is allowed for a file/region |
| `collab_propose_change` | Create a proposal for sensitive code |
| `collab_record_intent` | Document why code was written |
| `collab_get_intents` | Retrieve intents for a file |
| `collab_record_authorship` | Log authorship with confidence |
| `collab_status` | Get file or project status |
| `collab_init` | Initialize collaboration tracking |
| `collab_list_proposals` | List all pending proposals |
| `collab_apply_proposal` | Apply a pending proposal |
| `collab_reject_proposal` | Reject a pending proposal |

## Best Practices

### When to Use Each Trust Level

- **AUTONOMOUS**: Generated code, test files, configuration that can be regenerated
- **SUPERVISED**: Most application code — Claude proceeds carefully but can edit directly
- **SUGGEST_ONLY**: Core business logic, APIs, database schemas — changes need review
- **READ_ONLY**: Security code, cryptography, payment processing — humans only

### Annotation Placement

- Place annotations immediately before the function/class they protect
- Use block annotations (`@collab:begin`/`@collab:end`) for multiple related functions
- Keep annotations close to the code they protect for visibility

### Intent Documentation

Use `intent` and `constraints` to capture business context:

```typescript
// @collab trust="SUGGEST_ONLY"
// @collab intent="Calculate user subscription tier based on usage"
// @collab constraints=["Must handle grace periods", "Must be idempotent"]
function calculateTier(usage: UsageMetrics): SubscriptionTier {
  // ...
}
```

## Requirements

- Node.js >= 18
- Claude Code CLI

## License

MIT
