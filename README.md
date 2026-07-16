# 🔐 Secret Vault

A **zero-knowledge**, fully client-side password & secrets manager. All encryption/decryption happens locally in the browser — no server ever sees your plaintext data, master password, or derived keys.

## ✨ Features

- **Zero-Knowledge Architecture** — only ciphertext, IV, and salt are ever persisted (IndexedDB)
- **AES-256-GCM Encryption** — native Web Crypto API, random 96-bit IV per record
- **Strong Key Derivation** — PBKDF2-SHA256 with 600,000 iterations (OWASP 2023+ recommendation)
- **Memory Hygiene** — sensitive buffers are zero-wiped after use to reduce RAM-dump exposure
- **Offline TOTP (2FA)** *(planned)* — RFC 6238 compliant, no network calls
- **Passkeys / WebAuthn** *(planned)* — passwordless unlock support
- **Auto-lock & Clipboard Auto-wipe** *(planned)* — inactivity timeout and clipboard clearing

## 🛠️ Tech Stack

| Layer      | Technology                          |
|------------|--------------------------------------|
| UI         | React 19, TypeScript, Vite 8         |
| Storage    | Dexie.js (IndexedDB wrapper)         |
| Crypto     | Web Crypto API (AES-GCM, PBKDF2)     |
| Testing    | Vitest                               |
| Linting    | ESLint + typescript-eslint           |

## 📁 Project Structure

```
src/
├── core/
│   ├── crypto/       # AES-GCM engine, key derivation, memory wiping, TOTP
│   ├── storage/      # Dexie schema & vault repository (ciphertext only)
│   └── security/     # Auto-lock, clipboard manager
├── features/
│   ├── auth/         # Master password / passkey auth
│   ├── vault/        # Secret list, generator, CRUD
│   └── totp/         # QR scanner, live OTP countdown
└── shared/           # UI components, shared types
```

## 🚀 Getting Started

```bash
# Install dependencies
yarn install

# Run dev server
yarn dev

# Run tests
yarn test

# Lint
yarn lint

# Build for production
yarn build
```

## 🔒 Security Notes

- Master passwords are never stored — only used transiently to derive a non-extractable `CryptoKey`.
- All sensitive buffers (passwords, decrypted plaintext) are wiped from memory immediately after use.
- This project has not undergone a formal third-party security audit — use at your own risk for production secrets.

## 📄 License

This project is licensed under the [MIT License](LICENSE) — see the `LICENSE` file for details.
