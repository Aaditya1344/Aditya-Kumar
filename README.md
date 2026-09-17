# SecureID — Full-Stack IAM Demo Web App
### Multi-Factor Authentication (OTP/TOTP), Session Auth & JWT Bearer Token Architecture

A production-grade Identity and Access Management (IAM) demo web application built with vanilla JavaScript (no frameworks) and a Node.js / Express backend architected for seamless Vercel Serverless Function deployment.

---

## 🌟 Tech Stack & Architecture Highlights

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+) | Single-Page Application (SPA) with dynamic state-driven views and transitions without page reloads. "SecureID" design system with responsive desktop/mobile layouts. |
| **Backend API** | Node.js + Express + Serverless Function | Serverless `/api` architecture ready for Vercel deployment (`api/index.js`). |
| **Storage** | In-Memory (`Map`) Store | In-memory store for users, active sessions, OTP challenges, and rate limiters. *Resets on cold start / redeploy.* |
| **Password Security** | `bcryptjs` (Salt Rounds = 10) | Passwords hashed securely before storing. |
| **OTP & MFA Engine** | `crypto.randomInt` + SHA-256 / `otplib` | Server-side 6-digit cryptographic OTPs with SHA-256 salted hashes, expiry timers, attempt counters, and TOTP QR generation. |
| **Session Authentication** | `cookie-parser` | HttpOnly, SameSite, Secure session cookie (`sid`). |
| **JWT Authentication** | `jsonwebtoken` (`RS256` / `HS256`) | Independent stateless JWT Bearer token issuance (`/api/token`) and verification middleware (`/api/protected`). |

---

## 🛡️ Security Architecture & Decision Rules

1. **Backend-Driven Security**:
   - All authentication, authorization, and validation decisions occur exclusively on the backend.
   - Frontend UI transitions are strictly driven by backend response schemas (e.g. `{ mfaRequired: true, method: "authenticator", challengeId: "..." }`).
2. **Server-Side OTP Generation & Protection**:
   - OTP codes are **never** returned in API responses or generated on the client.
   - Stored as cryptographic hashes with 5-minute expiry (`expiresAt`) and attempt counters (`attempts`).
   - Single-use policy: OTP challenges are destroyed immediately upon successful verification.
3. **Simulated OTP Delivery**:
   - Email and SMS OTPs are logged directly to the server console:
     ```
     ============================================================
     [SIMULATED EMAIL] To: user@company.com OTP: 482913
     [SIMULATED EMAIL] Timestamp: 2026-09-17T09:24:34.555Z
     ============================================================
     ```
4. **Independent Session vs JWT Auth**:
   - **Session Auth**: Used for the primary user dashboard via an HttpOnly `sid` cookie.
   - **JWT Auth**: Exposed via a dedicated interactive playground (`/api/token` and `/api/protected`) using `Authorization: Bearer <jwt>`. Tokens are kept in memory only and never placed in `localStorage`.
5. **Account Lockout Protection**:
   - 5 consecutive failed login attempts trigger an automatic 5-minute temporary lockout.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
# or
npm run dev
```

The application will run on **http://localhost:3000**.

### 3. Run Automated End-to-End Test Suite
```bash
npm test
```
Runs 16 automated integration tests covering the full registration flow, OTP challenges, password rules, MFA setup, login, session cookies, JWT issuance, and lockout mechanics.

---

## 🧭 Step-by-Step User Journey Guide

### 📝 1. Registration Journey
1. **Registration Form**: Enter Full Name, Work Email, Mobile (`+91`), and Password.
   - Live password indicators check: 8+ characters, 1 uppercase, 1 number, 1 special character.
   - Accept terms and click **Create Account**.
2. **Email OTP Verification**: Check your terminal console for `[SIMULATED EMAIL] OTP: XXXXXX`. Enter the 6-digit code before the 5-minute timer expires.
3. **Mobile OTP Verification**: Check terminal for `[SIMULATED SMS] OTP: XXXXXX`. Enter code. (Optionally test "Wrong number? Change" link).
4. **MFA Setup**: Choose your preferred 2FA method:
   - **Authenticator App (Recommended)**: Scan the generated QR code or copy the secret key into Google Authenticator / Authy.
   - **SMS Authentication**: Receives simulated SMS OTP.
   - **Email Authentication**: Receives simulated Email OTP.
5. **MFA Verification**: Enter the 6-digit TOTP / OTP code to finalize setup.
6. **Success Screen**: View verification checkmarks and proceed to Login.

---

### 🔑 2. Login Journey
1. **Sign In**: Enter your registered email and password.
   - Test invalid credentials to observe red error styling.
   - Test 5 wrong attempts to trigger the temporary account lockout.
2. **Step-Up MFA Verification**: The server will prompt for your configured MFA method (TOTP or OTP).
3. **Authenticated Dashboard**: Upon success, an HttpOnly session cookie (`sid`) is set, and the profile dashboard loads.

---

### ⚡ 3. JWT Auth Playground (Inside Dashboard)
- Click **"1. Issue JWT Token (POST /api/token)"** to generate a stateless JWT token.
- Click **"2. Call Protected API (GET /api/protected)"** to inspect protected data returned via `Authorization: Bearer <jwt>`.
- Click **"3. Test Invalid Token"** to verify that 401 Unauthorized is returned when a forged token is sent.

---

## 📡 API Endpoint Reference

| Method | Endpoint | Description | Auth Type |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/register` | Initiates registration & sends Email OTP | Public |
| `POST` | `/api/send-email-otp` | Resends Email verification code | Challenge |
| `POST` | `/api/verify-email-otp` | Validates Email OTP & issues SMS challenge | Challenge |
| `POST` | `/api/send-sms-otp` | Resends or updates Mobile OTP | Challenge |
| `POST` | `/api/verify-sms-otp` | Validates SMS OTP | Challenge |
| `POST` | `/api/setup-mfa` | Generates TOTP QR or triggers SMS/Email MFA | User ID |
| `POST` | `/api/verify-mfa-setup` | Finalizes MFA setup and creates account | Challenge |
| `POST` | `/api/login` | Validates credentials & triggers MFA challenge | Public |
| `POST` | `/api/verify-login-otp` | Validates login MFA & sets session cookie | Challenge |
| `POST` | `/api/resend-login-otp` | Resends login MFA OTP | Challenge |
| `GET` | `/api/me` | Returns current user profile | Session Cookie |
| `POST` | `/api/logout` | Destroys session and clears cookie | Session Cookie |
| `POST` | `/api/token` | Generates short-lived JWT token | Session / Public |
| `GET` | `/api/protected` | Returns protected data | JWT Bearer |

---

## ☁️ Deploying to Vercel

This repository is pre-configured for **Vercel Serverless Functions**:
- `/api/index.js` exports the Express application.
- `/public` contains static assets (`index.html`, `style.css`, `app.js`).
- `vercel.json` maps incoming `/api/(.*)` requests to the serverless function and static assets to `/public`.

### Deployment Steps:
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project root directory.
3. Follow the CLI prompts to deploy.
4. During testing on Vercel, view simulated OTP codes under **Vercel Project Dashboard → Logs / Function Logs**.

---

## 📄 License
ISC License © 2026 Aditya Kumar
