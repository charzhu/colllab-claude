# Ruby Annotation Examples for collab-claude-code
#
# This file demonstrates all annotation patterns supported by the
# @collab system for trust level management.
#
# Ruby uses indentation/end-based scope detection similar to Python,
# so annotations apply to the entire class/method following them.

require 'bcrypt'
require 'jwt'
require 'openssl'
require 'base64'
require 'securerandom'

# ============================================
# SINGLE-LINE ANNOTATIONS
# ============================================

# @collab trust="READ_ONLY" owner="security-team"
class JWTValidator
  # This entire class is READ_ONLY
  # Claude cannot modify this code directly

  def initialize(secret_key)
    @secret_key = secret_key
  end

  def validate(token)
    begin
      decoded = JWT.decode(token, @secret_key, true, algorithm: 'HS256')
      Claims.new(decoded.first)
    rescue JWT::ExpiredSignature
      raise AuthenticationError, 'Token has expired'
    rescue JWT::DecodeError => e
      raise AuthenticationError, "Invalid token: #{e.message}"
    end
  end
end


# @collab trust="SUGGEST_ONLY" owner="payments-team"
class PaymentService
  # Claude must create a proposal to modify this class

  def initialize(stripe_client, logger)
    @stripe_client = stripe_client
    @logger = logger
  end

  def process_payment(amount, card_token)
    @logger.log_attempt(amount, card_token)

    begin
      charge = @stripe_client.charges.create(
        amount: (amount * 100).to_i,
        currency: 'usd',
        source: card_token
      )

      result = PaymentResult.new(success: true, charge_id: charge.id)
      @logger.log_success(result)
      result

    rescue Stripe::CardError => e
      @logger.log_failure(e)
      raise PaymentError, "Payment failed: #{e.message}"
    end
  end
end


# @collab trust="AUTONOMOUS"
class CurrencyFormatter
  # Claude can freely modify this class

  SYMBOLS = {
    'USD' => '$',
    'EUR' => '€',
    'GBP' => '£'
  }.freeze

  def format(amount, currency = 'USD')
    symbol = SYMBOLS.fetch(currency, currency)
    "#{symbol}#{'%.2f' % amount}"
  end
end


# ============================================
# MULTI-LINE ANNOTATIONS (attributes merge)
# ============================================

# @collab trust="SUGGEST_ONLY"
# @collab intent="Implement user authentication flow"
# @collab owner="auth-team"
class AuthenticationService
  # All @collab attributes are merged and applied to this class

  def initialize(user_repository, password_encoder, jwt_generator)
    @user_repository = user_repository
    @password_encoder = password_encoder
    @jwt_generator = jwt_generator
  end

  def authenticate(email, password)
    user = @user_repository.find_by_email(email)
    raise AuthenticationError, 'User not found' unless user

    unless @password_encoder.matches?(password, user.password_hash)
      raise AuthenticationError, 'Invalid password'
    end

    token = @jwt_generator.generate(user.id)

    AuthResult.new(user: user, token: token)
  end
end


# @collab trust="SUGGEST_ONLY"
# @collab intent="Rate limiting for API endpoints"
# @collab constraints=["Must not block legitimate traffic", "Must log violations"]
class RateLimiter
  # Constraints document requirements that must be preserved

  def initialize(max_requests, window_seconds)
    @max_requests = max_requests
    @window_seconds = window_seconds
    @requests = {}
    @mutex = Mutex.new
  end

  def check(client_id)
    now = Time.now.to_f
    window_start = now - @window_seconds

    @mutex.synchronize do
      @requests[client_id] ||= []
      @requests[client_id].reject! { |t| t < window_start }

      if @requests[client_id].length >= @max_requests
        puts "Rate limit exceeded: #{client_id}"
        return false
      end

      @requests[client_id] << now
      true
    end
  end
end


# ============================================
# BLOCK ANNOTATIONS (explicit regions)
# ============================================

# @collab:begin trust="READ_ONLY" owner="crypto-team"

# AES-256-GCM encryption service.
# This entire class is READ_ONLY.
class EncryptionService
  ALGORITHM = 'aes-256-gcm'.freeze

  def initialize(key)
    @key = key
  end

  def encrypt(plaintext)
    cipher = OpenSSL::Cipher.new(ALGORITHM)
    cipher.encrypt
    cipher.key = @key
    iv = cipher.random_iv

    encrypted = cipher.update(plaintext) + cipher.final
    auth_tag = cipher.auth_tag

    EncryptedData.new(
      iv: Base64.strict_encode64(iv),
      data: Base64.strict_encode64(encrypted),
      auth_tag: Base64.strict_encode64(auth_tag)
    )
  end

  def decrypt(encrypted)
    cipher = OpenSSL::Cipher.new(ALGORITHM)
    cipher.decrypt
    cipher.key = @key
    cipher.iv = Base64.strict_decode64(encrypted.iv)
    cipher.auth_tag = Base64.strict_decode64(encrypted.auth_tag)

    cipher.update(Base64.strict_decode64(encrypted.data)) + cipher.final
  end
end


# Password hashing using BCrypt
class PasswordHasher
  COST = 12

  def hash(password)
    BCrypt::Password.create(password, cost: COST)
  end

  def verify(password, hash)
    BCrypt::Password.new(hash) == password
  rescue BCrypt::Errors::InvalidHash
    false
  end
end

# @collab:end


# @collab:begin trust="SUGGEST_ONLY" intent="Database transaction handling"

# Fund transfer service with transactional guarantees.
class TransferService
  def initialize(account_repository, audit_logger)
    @account_repository = account_repository
    @audit_logger = audit_logger
  end

  def transfer(from_account_id, to_account_id, amount)
    ActiveRecord::Base.transaction do
      from_account = @account_repository.find_for_update(from_account_id)
      to_account = @account_repository.find_for_update(to_account_id)

      raise InsufficientFundsError, from_account_id if from_account.balance < amount

      from_account.update!(balance: from_account.balance - amount)
      to_account.update!(balance: to_account.balance + amount)

      @audit_logger.log('transfer', {
        from: from_account_id,
        to: to_account_id,
        amount: amount
      })

      TransferResult.new(success: true, transaction_id: SecureRandom.uuid)
    end
  end
end

# @collab:end


# ============================================
# CLASS WITH MIXED TRUST LEVELS
# ============================================

# @collab:begin trust="SUPERVISED"

# User management service with mixed trust levels.
class UserService
  def initialize(user_repository, audit_logger)
    @user_repository = user_repository
    @audit_logger = audit_logger
  end

  # Inner annotation takes precedence for this method
  # @collab trust="SUGGEST_ONLY" owner="privacy-team"
  def delete_user(user_id)
    # This method is SUGGEST_ONLY (requires proposal)
    # GDPR compliance - requires human review

    ActiveRecord::Base.transaction do
      @user_repository.delete_user_data(user_id)
      @user_repository.delete_user_posts(user_id)
      @user_repository.delete(user_id)
    end

    @audit_logger.log('user_deleted', { user_id: user_id })
  end

  # Falls back to block trust level (SUPERVISED)
  def update_profile(user_id, updates)
    user = @user_repository.find(user_id)
    raise UserNotFoundError, user_id unless user

    user.name = updates[:name] if updates.key?(:name)
    user.email = updates[:email] if updates.key?(:email)

    @user_repository.save(user)
    user
  end

  private

  def notify_user(user, event)
    # Internal helper method
    NotificationService.notify(user.email, event)
  end
end

# @collab:end


# ============================================
# DATA CLASSES
# ============================================

Claims = Struct.new(:sub, :exp, :iat, keyword_init: true) do
  def initialize(payload)
    super(
      sub: payload['sub'],
      exp: payload['exp'],
      iat: payload['iat']
    )
  end
end

PaymentResult = Struct.new(:success, :charge_id, keyword_init: true)
AuthResult = Struct.new(:user, :token, keyword_init: true)
EncryptedData = Struct.new(:iv, :data, :auth_tag, keyword_init: true)
TransferResult = Struct.new(:success, :transaction_id, keyword_init: true)

User = Struct.new(:id, :email, :name, :password_hash, keyword_init: true)
Account = Struct.new(:id, :balance, keyword_init: true)


# Custom Errors
class AuthenticationError < StandardError; end
class PaymentError < StandardError; end
class InsufficientFundsError < StandardError; end
class UserNotFoundError < StandardError; end
class AccountNotFoundError < StandardError; end
