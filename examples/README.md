# Annotation Examples

This directory contains complete, runnable examples of `@collab` annotations for various programming languages.

## Files

| File | Language | Comment Syntax |
|------|----------|----------------|
| [typescript.ts](typescript.ts) | TypeScript | `// @collab ...` |
| [python.py](python.py) | Python | `# @collab ...` |
| [golang.go](golang.go) | Go | `// @collab ...` |
| [java.java](java.java) | Java | `// @collab ...` |
| [rust.rs](rust.rs) | Rust | `// @collab ...` |
| [ruby.rb](ruby.rb) | Ruby | `# @collab ...` |

## Scope Detection

The annotation system automatically detects the scope of annotated code based on the language:

### Brace-Based Languages (Go, Rust, Java, TypeScript, JavaScript)

Annotations apply to the complete `{ ... }` block following them:

```go
// @collab trust="READ_ONLY"
func ValidateToken(token string) error {
    // Entire function is READ_ONLY
    // Detected by matching braces
}
```

### Indentation-Based Languages (Python)

Annotations apply to the indented block following them:

```python
# @collab trust="READ_ONLY"
def validate_token(token: str) -> dict:
    # Entire function is READ_ONLY
    # Detected by indentation level
    return jwt.decode(token, SECRET)
```

### Block Annotations (All Languages)

For explicit multi-function regions, use `@collab:begin` and `@collab:end`:

```typescript
// @collab:begin trust="READ_ONLY" owner="security-team"
function encrypt(data: string): string { ... }
function decrypt(data: string): string { ... }
function hash(data: string): string { ... }
// @collab:end
```

## Annotation Patterns

### 1. Single-Line (Most Common)

```typescript
// @collab trust="SUGGEST_ONLY" owner="payments-team"
function processPayment() { ... }
```

### 2. Multi-Line (Merged Attributes)

```typescript
// @collab trust="SUGGEST_ONLY"
// @collab intent="Payment processing"
// @collab constraints=["PCI compliant", "Audit logged"]
function processPayment() { ... }
```

### 3. Block (Multiple Functions)

```typescript
// @collab:begin trust="READ_ONLY"
function func1() { ... }
function func2() { ... }
// @collab:end
```

### 4. Nested (Inner Overrides Outer)

```typescript
// @collab:begin trust="SUPERVISED"
class UserService {
    // @collab trust="SUGGEST_ONLY"  // This method gets SUGGEST_ONLY
    deleteUser() { ... }

    updateProfile() { ... }  // This method gets SUPERVISED
}
// @collab:end
```

## Trust Level Reference

| Level | Claude Behavior |
|-------|-----------------|
| `AUTONOMOUS` | Can edit freely |
| `SUPERVISED` | Proceeds with caution (default) |
| `SUGGEST_ONLY` | Must create proposal |
| `READ_ONLY` | Cannot modify |

## Attribute Reference

| Attribute | Example | Purpose |
|-----------|---------|---------|
| `trust` | `trust="READ_ONLY"` | Set trust level |
| `owner` | `owner="security-team"` | Responsible person/team |
| `intent` | `intent="Validate JWT tokens"` | Document purpose |
| `constraints` | `constraints=["Must be idempotent"]` | Requirements to preserve |

## Usage Tips

1. **Place annotations immediately before** the function/class they protect
2. **Use block annotations** for related functions that share the same trust level
3. **Document intent** for business-critical code so future editors understand context
4. **List constraints** to preserve important behaviors during modifications
