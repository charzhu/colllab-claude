/**
 * Java Annotation Examples for collab-claude-code
 *
 * This file demonstrates all annotation patterns supported by the
 * @collab system for trust level management.
 *
 * Java uses brace-based scope detection, so annotations automatically
 * apply to the entire class/method following them.
 */
package com.example.collab;

import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.stereotype.*;
import org.springframework.transaction.annotation.*;

// ============================================
// SINGLE-LINE ANNOTATIONS
// ============================================

// @collab trust="READ_ONLY" owner="security-team"
public class JWTValidator {

    private final String secretKey;

    public JWTValidator(String secretKey) {
        this.secretKey = secretKey;
    }

    /**
     * Validate a JWT token and return its claims.
     * This entire class is READ_ONLY.
     * Claude cannot modify this code directly.
     */
    public Claims validateToken(String token) throws AuthenticationException {
        try {
            Jws<Claims> jws = Jwts.parserBuilder()
                .setSigningKey(secretKey.getBytes())
                .build()
                .parseClaimsJws(token);

            return jws.getBody();
        } catch (ExpiredJwtException e) {
            throw new AuthenticationException("Token has expired");
        } catch (JwtException e) {
            throw new AuthenticationException("Invalid token");
        }
    }
}


// @collab trust="SUGGEST_ONLY" owner="payments-team"
@Service
public class PaymentService {

    private final StripeClient stripeClient;
    private final TransactionLogger logger;

    /**
     * Process a payment through Stripe.
     * Claude must create a proposal to modify this class.
     */
    public PaymentResult processPayment(long amount, String cardToken) {
        logger.logAttempt(amount, cardToken);

        try {
            Charge charge = stripeClient.charges().create(
                ChargeCreateParams.builder()
                    .setAmount(amount)
                    .setCurrency("usd")
                    .setSource(cardToken)
                    .build()
            );

            PaymentResult result = new PaymentResult(true, charge.getId());
            logger.logSuccess(result);
            return result;

        } catch (StripeException e) {
            logger.logFailure(e);
            throw new PaymentException("Payment failed: " + e.getMessage(), e);
        }
    }
}


// @collab trust="AUTONOMOUS"
@Component
public class CurrencyFormatter {

    /**
     * Format an amount as currency.
     * Claude can freely modify this class.
     */
    public String format(double amount) {
        return String.format("$%.2f", amount);
    }

    public String format(double amount, String currencyCode) {
        Currency currency = Currency.getInstance(currencyCode);
        return String.format("%s%.2f", currency.getSymbol(), amount);
    }
}


// ============================================
// MULTI-LINE ANNOTATIONS (attributes merge)
// ============================================

// @collab trust="SUGGEST_ONLY"
// @collab intent="Implement user authentication flow"
// @collab owner="auth-team"
@Service
public class AuthenticationService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JWTGenerator jwtGenerator;

    public AuthenticationService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JWTGenerator jwtGenerator) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtGenerator = jwtGenerator;
    }

    /**
     * Authenticate a user with email and password.
     * All @collab attributes are merged and applied to this class.
     */
    public AuthResult authenticate(String email, String password) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new AuthenticationException("User not found"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new AuthenticationException("Invalid password");
        }

        String token = jwtGenerator.generate(user.getId());

        return new AuthResult(user, token);
    }
}


// @collab trust="SUGGEST_ONLY"
// @collab intent="Rate limiting for API endpoints"
// @collab constraints=["Must not block legitimate traffic", "Must log violations"]
@Component
public class RateLimiter {

    private final Map<String, Deque<Long>> requestTimestamps = new ConcurrentHashMap<>();
    private final int maxRequests;
    private final long windowMs;

    public RateLimiter(int maxRequests, long windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    /**
     * Check if a client is within rate limits.
     * Constraints document requirements that must be preserved.
     */
    public boolean check(String clientId) {
        long now = System.currentTimeMillis();
        long windowStart = now - windowMs;

        Deque<Long> timestamps = requestTimestamps.computeIfAbsent(
            clientId, k -> new ConcurrentLinkedDeque<>()
        );

        // Remove old timestamps
        while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
            timestamps.pollFirst();
        }

        if (timestamps.size() >= maxRequests) {
            System.out.println("Rate limit exceeded: " + clientId);
            return false;
        }

        timestamps.addLast(now);
        return true;
    }
}


// ============================================
// BLOCK ANNOTATIONS (explicit regions)
// ============================================

// @collab:begin trust="READ_ONLY" owner="crypto-team"

/**
 * AES-256-GCM encryption service.
 * This entire class is READ_ONLY.
 */
@Service
public class EncryptionService {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128;
    private static final int GCM_IV_LENGTH = 12;

    private final SecretKey secretKey;

    public EncryptionService(byte[] keyBytes) throws NoSuchAlgorithmException {
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
    }

    public EncryptedData encrypt(byte[] plaintext) throws GeneralSecurityException {
        byte[] iv = new byte[GCM_IV_LENGTH];
        SecureRandom.getInstanceStrong().nextBytes(iv);

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec);

        byte[] ciphertext = cipher.doFinal(plaintext);

        return new EncryptedData(
            Base64.getEncoder().encodeToString(iv),
            Base64.getEncoder().encodeToString(ciphertext)
        );
    }

    public byte[] decrypt(EncryptedData encrypted) throws GeneralSecurityException {
        byte[] iv = Base64.getDecoder().decode(encrypted.getIv());
        byte[] ciphertext = Base64.getDecoder().decode(encrypted.getData());

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
        cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);

        return cipher.doFinal(ciphertext);
    }
}


/**
 * Password hashing service using BCrypt.
 */
@Service
public class PasswordHasher {

    private static final int BCRYPT_ROUNDS = 12;

    public String hash(String password) {
        return BCrypt.hashpw(password, BCrypt.gensalt(BCRYPT_ROUNDS));
    }

    public boolean verify(String password, String hash) {
        return BCrypt.checkpw(password, hash);
    }
}

// @collab:end


// @collab:begin trust="SUGGEST_ONLY" intent="Database transaction handling"

/**
 * Fund transfer service with transactional guarantees.
 */
@Service
public class TransferService {

    private final AccountRepository accountRepository;
    private final AuditLogger auditLogger;

    public TransferService(AccountRepository accountRepository, AuditLogger auditLogger) {
        this.accountRepository = accountRepository;
        this.auditLogger = auditLogger;
    }

    @Transactional
    public TransferResult transfer(String fromAccountId, String toAccountId, long amount) {
        Account fromAccount = accountRepository.findByIdForUpdate(fromAccountId)
            .orElseThrow(() -> new AccountNotFoundException(fromAccountId));

        Account toAccount = accountRepository.findByIdForUpdate(toAccountId)
            .orElseThrow(() -> new AccountNotFoundException(toAccountId));

        if (fromAccount.getBalance() < amount) {
            throw new InsufficientFundsException(fromAccountId);
        }

        fromAccount.setBalance(fromAccount.getBalance() - amount);
        toAccount.setBalance(toAccount.getBalance() + amount);

        accountRepository.save(fromAccount);
        accountRepository.save(toAccount);

        auditLogger.log("transfer", Map.of(
            "from", fromAccountId,
            "to", toAccountId,
            "amount", String.valueOf(amount)
        ));

        return new TransferResult(true, UUID.randomUUID().toString());
    }
}

// @collab:end


// ============================================
// CLASS WITH MIXED TRUST LEVELS
// ============================================

// @collab:begin trust="SUPERVISED"

/**
 * User management service with mixed trust levels.
 */
@Service
public class UserService {

    private final UserRepository userRepository;
    private final AuditLogger auditLogger;

    public UserService(UserRepository userRepository, AuditLogger auditLogger) {
        this.userRepository = userRepository;
        this.auditLogger = auditLogger;
    }

    // Inner annotation takes precedence for this method
    // @collab trust="SUGGEST_ONLY" owner="privacy-team"
    @Transactional
    public void deleteUser(String userId) {
        // This method is SUGGEST_ONLY (requires proposal)
        // GDPR compliance - requires human review

        userRepository.deleteUserData(userId);
        userRepository.deleteUserPosts(userId);
        userRepository.deleteById(userId);

        auditLogger.log("user_deleted", Map.of("userId", userId));
    }

    // Falls back to block trust level (SUPERVISED)
    @Transactional
    public User updateProfile(String userId, Map<String, Object> updates) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException(userId));

        if (updates.containsKey("name")) {
            user.setName((String) updates.get("name"));
        }
        if (updates.containsKey("email")) {
            user.setEmail((String) updates.get("email"));
        }

        return userRepository.save(user);
    }
}

// @collab:end


// ============================================
// DATA CLASSES
// ============================================

record PaymentResult(boolean success, String chargeId) {}

record AuthResult(User user, String token) {}

record EncryptedData(String iv, String data) {
    public String getIv() { return iv; }
    public String getData() { return data; }
}

record TransferResult(boolean success, String transactionId) {}

class User {
    private String id;
    private String email;
    private String name;
    private String passwordHash;

    // Getters and setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
}

class Account {
    private String id;
    private long balance;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public long getBalance() { return balance; }
    public void setBalance(long balance) { this.balance = balance; }
}

// Exceptions
class AuthenticationException extends RuntimeException {
    public AuthenticationException(String message) { super(message); }
}

class PaymentException extends RuntimeException {
    public PaymentException(String message, Throwable cause) { super(message, cause); }
}

class InsufficientFundsException extends RuntimeException {
    public InsufficientFundsException(String accountId) {
        super("Insufficient funds in account: " + accountId);
    }
}

class AccountNotFoundException extends RuntimeException {
    public AccountNotFoundException(String accountId) {
        super("Account not found: " + accountId);
    }
}

class UserNotFoundException extends RuntimeException {
    public UserNotFoundException(String userId) {
        super("User not found: " + userId);
    }
}
