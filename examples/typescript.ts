/**
 * TypeScript Annotation Examples for collab-claude-code
 *
 * This file demonstrates all annotation patterns supported by the
 * @collab system for trust level management.
 */

// ============================================
// SINGLE-LINE ANNOTATIONS
// ============================================

// @collab trust="READ_ONLY" owner="security-team"
function validateJWT(token: string): JWTPayload {
  // This entire function is READ_ONLY
  // Claude cannot modify this code directly
  const decoded = jwt.verify(token, process.env.JWT_SECRET!);
  if (typeof decoded === "string") {
    throw new Error("Invalid token format");
  }
  return decoded as JWTPayload;
}

// @collab trust="SUGGEST_ONLY" owner="payments-team"
async function processPayment(
  amount: number,
  cardToken: string
): Promise<PaymentResult> {
  // Claude must create a proposal to modify this function
  const charge = await stripe.charges.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    source: cardToken,
  });
  return { success: true, chargeId: charge.id };
}

// @collab trust="AUTONOMOUS"
function formatCurrency(amount: number): string {
  // Claude can freely modify this function
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// ============================================
// MULTI-LINE ANNOTATIONS (attributes merge)
// ============================================

// @collab trust="SUGGEST_ONLY"
// @collab intent="Implement user authentication flow"
// @collab owner="auth-team"
async function authenticateUser(
  email: string,
  password: string
): Promise<AuthResult> {
  // All @collab attributes are merged and applied to this function
  const user = await db.users.findByEmail(email);
  if (!user) {
    throw new AuthError("User not found");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid password");
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
    expiresIn: "24h",
  });

  return { user, token };
}

// @collab trust="SUGGEST_ONLY"
// @collab intent="Rate limiting for API endpoints"
// @collab constraints=["Must not block legitimate traffic", "Must log violations"]
function createRateLimiter(
  maxRequests: number,
  windowMs: number
): RateLimiter {
  // Constraints document requirements that must be preserved
  const requests = new Map<string, number[]>();

  return {
    check(clientId: string): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      const clientRequests = requests.get(clientId) || [];
      const recentRequests = clientRequests.filter((t) => t > windowStart);

      if (recentRequests.length >= maxRequests) {
        console.log(`Rate limit exceeded: ${clientId}`);
        return false;
      }

      recentRequests.push(now);
      requests.set(clientId, recentRequests);
      return true;
    },
  };
}

// ============================================
// BLOCK ANNOTATIONS (explicit regions)
// ============================================

// @collab:begin trust="READ_ONLY" owner="crypto-team"
class EncryptionService {
  private readonly key: Buffer;
  private readonly algorithm = "aes-256-gcm";

  constructor(key: string) {
    this.key = Buffer.from(key, "hex");
  }

  encrypt(plaintext: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString("hex"),
      data: encrypted,
      authTag: authTag.toString("hex"),
    };
  }

  decrypt(encrypted: EncryptedData): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(encrypted.iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "hex"));

    let decrypted = decipher.update(encrypted.data, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}
// @collab:end

// @collab:begin trust="SUGGEST_ONLY" intent="Database transaction handling"
async function withTransaction<T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  const tx = await db.beginTransaction();

  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function transferFunds(
  fromAccountId: string,
  toAccountId: string,
  amount: number
): Promise<TransferResult> {
  return withTransaction(async (tx) => {
    const fromAccount = await tx.accounts.findById(fromAccountId);
    const toAccount = await tx.accounts.findById(toAccountId);

    if (fromAccount.balance < amount) {
      throw new InsufficientFundsError();
    }

    await tx.accounts.update(fromAccountId, {
      balance: fromAccount.balance - amount,
    });
    await tx.accounts.update(toAccountId, {
      balance: toAccount.balance + amount,
    });

    return { success: true, transactionId: tx.id };
  });
}
// @collab:end

// ============================================
// MIXED: Annotations inside block regions
// ============================================

// @collab:begin trust="SUPERVISED"
class UserService {
  // Inner annotation takes precedence for this method
  // @collab trust="SUGGEST_ONLY" owner="privacy-team"
  async deleteUser(userId: string): Promise<void> {
    // GDPR compliance - requires proposal
    await this.deleteUserData(userId);
    await this.deleteUserPosts(userId);
    await this.deleteUserAccount(userId);
    await auditLog.record("user_deleted", { userId });
  }

  // Falls back to block trust level (SUPERVISED)
  async updateUserProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<UserProfile> {
    return db.users.update(userId, updates);
  }
}
// @collab:end

// ============================================
// TYPE DEFINITIONS (no annotations needed typically)
// ============================================

interface JWTPayload {
  userId: string;
  exp: number;
  iat: number;
}

interface PaymentResult {
  success: boolean;
  chargeId: string;
}

interface AuthResult {
  user: User;
  token: string;
}

interface RateLimiter {
  check(clientId: string): boolean;
}

interface EncryptedData {
  iv: string;
  data: string;
  authTag: string;
}

interface Transaction {
  id: string;
  accounts: AccountRepository;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

interface TransferResult {
  success: boolean;
  transactionId: string;
}

interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
}

interface User {
  id: string;
  email: string;
  passwordHash: string;
}
