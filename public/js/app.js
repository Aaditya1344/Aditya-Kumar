/**
 * SECUREID IAM CLIENT CONTROLLER
 * Pure Vanilla JavaScript Application (No frameworks)
 * Manages Dynamic Views, OTP Challenges, Session State & JWT Playground
 */

(function () {
  'use strict';

  class IAMApp {
    constructor() {
      // In-Memory App State
      this.state = {
        currentUser: null,
        regChallengeId: null,
        regUserId: null,
        regEmail: null,
        regMobile: null,
        regCountryCode: '+91',
        selectedMfaMethod: 'authenticator',
        totpSecret: null,
        loginChallengeId: null,
        loginMethod: null,
        jwtToken: null // Stored strictly in memory, never persisted in localStorage
      };

      this.timers = {};
      this.init();
    }

    init() {
      this.bindEvents();
      this.setupOtpInputs();
      this.setupPasswordChecklist();
      this.checkActiveSession();
    }

    /* ==========================================================================
       VIEW MANAGEMENT & ROUTING
       ========================================================================== */
    showView(viewId) {
      document.querySelectorAll('.auth-view').forEach(view => {
        view.classList.remove('active');
      });
      const target = document.getElementById(viewId);
      if (target) {
        target.classList.add('active');
        // Clear old alerts in the new view
        this.clearAlerts();
        // Focus first input if available
        const firstInput = target.querySelector('input:not([type=hidden])');
        if (firstInput) {
          setTimeout(() => firstInput.focus(), 100);
        }
      }
    }

    showAlert(containerId, message, type = 'danger') {
      const banner = document.getElementById(containerId);
      if (banner) {
        banner.className = `alert-banner active alert-${type}`;
        banner.innerHTML = `<span>${message}</span>`;
      }
    }

    clearAlerts() {
      document.querySelectorAll('.alert-banner').forEach(banner => {
        banner.className = 'alert-banner';
        banner.innerHTML = '';
      });
      document.querySelectorAll('.form-input, .otp-box').forEach(input => {
        input.classList.remove('error');
      });
    }

    /* ==========================================================================
       EVENT BINDINGS & INTERACTIONS
       ========================================================================== */
    bindEvents() {
      // Password Show/Hide toggles
      document.querySelectorAll('.toggle-password-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const targetId = btn.getAttribute('data-target');
          const input = document.getElementById(targetId);
          if (input) {
            if (input.type === 'password') {
              input.type = 'text';
              btn.textContent = '🙈';
            } else {
              input.type = 'password';
              btn.textContent = '👁️';
            }
          }
        });
      });

      // Registration Form Submit
      const formRegister = document.getElementById('form-register');
      if (formRegister) {
        formRegister.addEventListener('submit', (e) => this.handleRegisterSubmit(e));
      }

      // Email OTP Verification
      const btnVerifyEmailOtp = document.getElementById('btn-verify-email-otp');
      if (btnVerifyEmailOtp) {
        btnVerifyEmailOtp.addEventListener('click', () => this.handleVerifyEmailOtp());
      }

      // Resend Email OTP
      const btnResendEmailOtp = document.getElementById('btn-resend-email-otp');
      if (btnResendEmailOtp) {
        btnResendEmailOtp.addEventListener('click', () => this.handleResendEmailOtp());
      }

      // Mobile Number Change Toggle
      const btnChangeMobileToggle = document.getElementById('btn-change-mobile-toggle');
      if (btnChangeMobileToggle) {
        btnChangeMobileToggle.addEventListener('click', () => {
          const box = document.getElementById('box-change-mobile');
          box.style.display = box.style.display === 'none' ? 'block' : 'none';
        });
      }

      // Save & Resend Mobile OTP
      const btnSaveMobile = document.getElementById('btn-save-mobile');
      if (btnSaveMobile) {
        btnSaveMobile.addEventListener('click', () => this.handleUpdateMobileAndResend());
      }

      // Mobile OTP Verification
      const btnVerifySmsOtp = document.getElementById('btn-verify-sms-otp');
      if (btnVerifySmsOtp) {
        btnVerifySmsOtp.addEventListener('click', () => this.handleVerifySmsOtp());
      }

      // Resend Mobile OTP
      const btnResendSmsOtp = document.getElementById('btn-resend-sms-otp');
      if (btnResendSmsOtp) {
        btnResendSmsOtp.addEventListener('click', () => this.handleResendSmsOtp());
      }

      // MFA Method Card Selection
      document.querySelectorAll('.mfa-option-card').forEach(card => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.mfa-option-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          this.state.selectedMfaMethod = card.getAttribute('data-method');
        });
      });

      // Continue MFA Setup
      const btnContinueMfaSetup = document.getElementById('btn-continue-mfa-setup');
      if (btnContinueMfaSetup) {
        btnContinueMfaSetup.addEventListener('click', () => this.handleInitiateMfaSetup());
      }

      // Authenticator Setup Key Toggle & Copy
      const btnToggleSetupKey = document.getElementById('btn-toggle-setup-key');
      if (btnToggleSetupKey) {
        btnToggleSetupKey.addEventListener('click', () => {
          const container = document.getElementById('setup-key-container');
          container.style.display = container.style.display === 'none' ? 'block' : 'none';
        });
      }

      const btnCopySecret = document.getElementById('btn-copy-secret');
      if (btnCopySecret) {
        btnCopySecret.addEventListener('click', () => {
          if (this.state.totpSecret) {
            navigator.clipboard.writeText(this.state.totpSecret).then(() => {
              btnCopySecret.textContent = 'Copied!';
              setTimeout(() => btnCopySecret.textContent = 'Copy', 2000);
            });
          }
        });
      }

      const btnContinueTotpVerify = document.getElementById('btn-continue-totp-verify');
      if (btnContinueTotpVerify) {
        btnContinueTotpVerify.addEventListener('click', () => {
          this.showView('view-register-mfa-verify');
          this.setupMfaVerifyScreen('authenticator');
        });
      }

      // Submit MFA Setup Code Verification
      const btnSubmitMfaVerify = document.getElementById('btn-submit-mfa-verify');
      if (btnSubmitMfaVerify) {
        btnSubmitMfaVerify.addEventListener('click', () => this.handleSubmitMfaVerify());
      }

      // Login Form Submit
      const formLogin = document.getElementById('form-login');
      if (formLogin) {
        formLogin.addEventListener('submit', (e) => this.handleLoginSubmit(e));
      }

      // Login OTP Verification
      const btnVerifyLoginOtp = document.getElementById('btn-verify-login-otp');
      if (btnVerifyLoginOtp) {
        btnVerifyLoginOtp.addEventListener('click', () => this.handleVerifyLoginOtp());
      }

      // Resend Login OTP
      const btnResendLoginOtp = document.getElementById('btn-resend-login-otp');
      if (btnResendLoginOtp) {
        btnResendLoginOtp.addEventListener('click', () => this.handleResendLoginOtp());
      }

      // Logout
      const btnLogout = document.getElementById('btn-logout');
      if (btnLogout) {
        btnLogout.addEventListener('click', () => this.handleLogout());
      }

      // JWT Demo Playground
      const btnIssueJwt = document.getElementById('btn-issue-jwt');
      if (btnIssueJwt) {
        btnIssueJwt.addEventListener('click', () => this.handleIssueJwt());
      }

      const btnCallProtectedJwt = document.getElementById('btn-call-protected-jwt');
      if (btnCallProtectedJwt) {
        btnCallProtectedJwt.addEventListener('click', () => this.handleCallProtectedJwt());
      }

      const btnTestInvalidJwt = document.getElementById('btn-test-invalid-jwt');
      if (btnTestInvalidJwt) {
        btnTestInvalidJwt.addEventListener('click', () => this.handleTestInvalidJwt());
      }
    }

    /* ==========================================================================
       6-DIGIT OTP BOXES HELPER
       ========================================================================== */
    setupOtpInputs() {
      const boxGroups = ['email-otp-boxes', 'sms-otp-boxes', 'mfa-verify-boxes', 'login-otp-boxes'];

      boxGroups.forEach(groupId => {
        const container = document.getElementById(groupId);
        if (!container) return;
        const inputs = container.querySelectorAll('.otp-box');

        inputs.forEach((input, index) => {
          // Handle Single Digit Key Typing
          input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val ? val[0] : '';

            if (val && index < inputs.length - 1) {
              inputs[index + 1].focus();
            }
          });

          // Handle Backspace & Arrow Navigation
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
              inputs[index - 1].focus();
            } else if (e.key === 'ArrowLeft' && index > 0) {
              inputs[index - 1].focus();
            } else if (e.key === 'ArrowRight' && index < inputs.length - 1) {
              inputs[index + 1].focus();
            }
          });

          // Handle Clipboard Paste (e.g. pasting full 6 digits)
          input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = (e.clipboardData || window.clipboardData).getData('text').trim();
            const digits = pastedData.replace(/\D/g, '').slice(0, 6);
            if (digits) {
              for (let i = 0; i < inputs.length; i++) {
                inputs[i].value = digits[i] || '';
              }
              const lastFilledIdx = Math.min(digits.length, inputs.length) - 1;
              if (lastFilledIdx >= 0 && lastFilledIdx < inputs.length) {
                inputs[lastFilledIdx].focus();
              }
            }
          });
        });
      });
    }

    getOtpValue(groupId) {
      const container = document.getElementById(groupId);
      if (!container) return '';
      const inputs = container.querySelectorAll('.otp-box');
      let code = '';
      inputs.forEach(input => {
        code += input.value.trim();
      });
      return code;
    }

    clearOtpBoxes(groupId) {
      const container = document.getElementById(groupId);
      if (!container) return;
      container.querySelectorAll('.otp-box').forEach(input => {
        input.value = '';
        input.classList.remove('error');
        input.disabled = false;
      });
      const first = container.querySelector('.otp-box');
      if (first) first.focus();
    }

    setOtpBoxesDisabled(groupId, disabled) {
      const container = document.getElementById(groupId);
      if (!container) return;
      container.querySelectorAll('.otp-box').forEach(input => {
        input.disabled = disabled;
      });
    }

    highlightOtpError(groupId) {
      const container = document.getElementById(groupId);
      if (!container) return;
      const inputs = container.querySelectorAll('.otp-box');
      inputs.forEach(input => {
        input.classList.add('error');
      });
      // Focus on first box for retry
      if (inputs.length > 0) {
        inputs[0].focus();
      }
    }

    /* ==========================================================================
       PASSWORD CHECKLIST VALIDATION
       ========================================================================== */
    setupPasswordChecklist() {
      const passwordInput = document.getElementById('reg-password');
      if (!passwordInput) return;

      passwordInput.addEventListener('input', () => {
        const val = passwordInput.value;
        const reqLength = document.getElementById('req-length');
        const reqUpper = document.getElementById('req-upper');
        const reqNumber = document.getElementById('req-number');
        const reqSpecial = document.getElementById('req-special');

        this.updateReqItem(reqLength, val.length >= 8);
        this.updateReqItem(reqUpper, /[A-Z]/.test(val));
        this.updateReqItem(reqNumber, /[0-9]/.test(val));
        this.updateReqItem(reqSpecial, /[^A-Za-z0-9]/.test(val));
      });
    }

    updateReqItem(element, isValid) {
      if (!element) return;
      if (isValid) {
        element.classList.add('valid');
        element.querySelector('.req-icon').textContent = '✓';
      } else {
        element.classList.remove('valid');
        element.querySelector('.req-icon').textContent = '○';
      }
    }

    /* ==========================================================================
       TIMERS & COUNTDOWNS
       ========================================================================== */
    startExpiryTimer(timerElementId, durationSeconds, onExpired) {
      if (this.timers[timerElementId]) {
        clearInterval(this.timers[timerElementId]);
      }

      let remaining = durationSeconds;
      const element = document.getElementById(timerElementId);

      const render = () => {
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        if (element) {
          element.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        if (remaining <= 0) {
          clearInterval(this.timers[timerElementId]);
          if (onExpired) onExpired();
        }
        remaining--;
      };

      render();
      this.timers[timerElementId] = setInterval(render, 1000);
    }

    startCooldownTimer(buttonId, timerSpanId, cooldownSeconds = 30) {
      const btn = document.getElementById(buttonId);
      const span = document.getElementById(timerSpanId);
      if (!btn) return;

      btn.disabled = true;
      let remaining = cooldownSeconds;

      const interval = setInterval(() => {
        remaining--;
        if (span) span.textContent = `${remaining}s`;
        if (remaining <= 0) {
          clearInterval(interval);
          btn.disabled = false;
          btn.textContent = 'Resend Code';
        }
      }, 1000);
    }

    /* ==========================================================================
       REGISTRATION JOURNEY IMPLEMENTATION
       ========================================================================== */
    async handleRegisterSubmit(e) {
      e.preventDefault();
      this.clearAlerts();

      const fullName = document.getElementById('reg-fullname').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const mobile = document.getElementById('reg-mobile').value.trim();
      const countryCode = document.getElementById('reg-country-code').value;
      const password = document.getElementById('reg-password').value;
      const terms = document.getElementById('reg-terms').checked;

      if (!fullName || !email || !mobile || !password) {
        this.showAlert('global-alert', 'Please complete all required fields.');
        return;
      }

      if (!terms) {
        this.showAlert('global-alert', 'You must agree to the Terms of Service to create an account.');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-register');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';

      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, email, mobile, countryCode, password, terms })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          this.showAlert('global-alert', data.error || 'Registration failed.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
          return;
        }

        // Store registration challenge state
        this.state.regChallengeId = data.challengeId;
        this.state.regEmail = data.email;
        this.state.regMobile = mobile;
        this.state.regCountryCode = countryCode;

        // Transition to Registration Step 2 (Email OTP)
        document.getElementById('display-reg-email').textContent = data.email;
        this.clearOtpBoxes('email-otp-boxes');
        this.showView('view-register-email-otp');

        // Start Expiry and Cooldown Timers
        this.startExpiryTimer('email-otp-timer', data.expiresIn || 300, () => {
          this.clearOtpBoxes('email-otp-boxes');
          this.showAlert('alert-email-otp', 'This code has expired. Please request a new code.', 'warning');
          const resendBtn = document.getElementById('btn-resend-email-otp');
          if (resendBtn) {
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend New Code';
          }
        });

        this.startCooldownTimer('btn-resend-email-otp', 'email-resend-timer', 30);
      } catch (err) {
        console.error('Registration Error:', err);
        this.showAlert('global-alert', 'Network error occurred. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    }

    async handleVerifyEmailOtp() {
      const otp = this.getOtpValue('email-otp-boxes');
      if (otp.length !== 6) {
        this.showAlert('alert-email-otp', 'Please enter all 6 digits of the verification code.');
        return;
      }

      const verifyBtn = document.getElementById('btn-verify-email-otp');
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';

      try {
        const response = await fetch('/api/verify-email-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: this.state.regChallengeId,
            otp
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          this.highlightOtpError('email-otp-boxes');

          if (data.maxAttemptsReached) {
            this.setOtpBoxesDisabled('email-otp-boxes', true);
            this.showAlert('alert-email-otp', 'Maximum attempts reached. Please request a new code.', 'danger');
            const resendBtn = document.getElementById('btn-resend-email-otp');
            if (resendBtn) {
              resendBtn.disabled = false;
              resendBtn.textContent = 'Resend New Code';
            }
          } else if (data.expired) {
            this.clearOtpBoxes('email-otp-boxes');
            this.showAlert('alert-email-otp', 'This code has expired.', 'warning');
            const resendBtn = document.getElementById('btn-resend-email-otp');
            if (resendBtn) {
              resendBtn.disabled = false;
              resendBtn.textContent = 'Resend New Code';
            }
          } else {
            const remaining = data.attemptsRemaining !== undefined ? ` (${data.attemptsRemaining} attempts remaining)` : '';
            this.showAlert('alert-email-otp', `Incorrect code. Please try again.${remaining}`, 'danger');
          }
          return;
        }

        // Successfully Verified Email -> Transition to Step 3 (Mobile OTP)
        this.state.regUserId = data.userId;
        this.state.regChallengeId = data.challengeId;
        this.state.regMobile = data.mobile;
        this.state.regCountryCode = data.countryCode;

        document.getElementById('display-reg-mobile').textContent = `${data.countryCode} ${data.mobile}`;
        this.clearOtpBoxes('sms-otp-boxes');
        this.showView('view-register-sms-otp');

        this.startExpiryTimer('sms-otp-timer', data.expiresIn || 300, () => {
          this.clearOtpBoxes('sms-otp-boxes');
          this.showAlert('alert-sms-otp', 'This code has expired.', 'warning');
          const resendBtn = document.getElementById('btn-resend-sms-otp');
          if (resendBtn) {
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend New Code';
          }
        });

        this.startCooldownTimer('btn-resend-sms-otp', 'sms-resend-timer', 30);
      } catch (err) {
        console.error('Email OTP verify error:', err);
        this.showAlert('alert-email-otp', 'Failed to verify email OTP.');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify Email Code';
      }
    }

    async handleResendEmailOtp() {
      try {
        const response = await fetch('/api/send-email-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: this.state.regChallengeId,
            email: this.state.regEmail,
            userId: this.state.regUserId
          })
        });

        const data = await response.json();
        if (data.success) {
          this.state.regChallengeId = data.challengeId;
          this.clearOtpBoxes('email-otp-boxes');
          this.showAlert('alert-email-otp', 'A new verification code has been simulated and sent!', 'info');
          this.startExpiryTimer('email-otp-timer', data.expiresIn || 300);
          this.startCooldownTimer('btn-resend-email-otp', 'email-resend-timer', 30);
        }
      } catch (err) {
        this.showAlert('alert-email-otp', 'Failed to resend email code.');
      }
    }

    async handleUpdateMobileAndResend() {
      const newMobile = document.getElementById('input-update-mobile').value.trim();
      if (!newMobile) {
        this.showAlert('alert-sms-otp', 'Please enter a valid mobile number.');
        return;
      }

      this.state.regMobile = newMobile;
      document.getElementById('display-reg-mobile').textContent = `${this.state.regCountryCode} ${newMobile}`;
      document.getElementById('box-change-mobile').style.display = 'none';

      await this.handleResendSmsOtp(newMobile);
    }

    async handleResendSmsOtp(updatedMobile = null) {
      try {
        const response = await fetch('/api/send-sms-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: this.state.regChallengeId,
            userId: this.state.regUserId,
            mobile: updatedMobile || this.state.regMobile,
            countryCode: this.state.regCountryCode
          })
        });

        const data = await response.json();
        if (data.success) {
          this.state.regChallengeId = data.challengeId;
          this.clearOtpBoxes('sms-otp-boxes');
          this.showAlert('alert-sms-otp', 'A new SMS code has been simulated and sent!', 'info');
          this.startExpiryTimer('sms-otp-timer', data.expiresIn || 300);
          this.startCooldownTimer('btn-resend-sms-otp', 'sms-resend-timer', 30);
        }
      } catch (err) {
        this.showAlert('alert-sms-otp', 'Failed to resend SMS code.');
      }
    }

    async handleVerifySmsOtp() {
      const otp = this.getOtpValue('sms-otp-boxes');
      if (otp.length !== 6) {
        this.showAlert('alert-sms-otp', 'Please enter all 6 digits of the SMS code.');
        return;
      }

      const verifyBtn = document.getElementById('btn-verify-sms-otp');
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';

      try {
        const response = await fetch('/api/verify-sms-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: this.state.regChallengeId,
            otp
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          this.highlightOtpError('sms-otp-boxes');

          if (data.maxAttemptsReached) {
            this.setOtpBoxesDisabled('sms-otp-boxes', true);
            this.showAlert('alert-sms-otp', 'Maximum attempts reached. Please request a new code.', 'danger');
            const resendBtn = document.getElementById('btn-resend-sms-otp');
            if (resendBtn) {
              resendBtn.disabled = false;
              resendBtn.textContent = 'Resend New Code';
            }
          } else if (data.expired) {
            this.clearOtpBoxes('sms-otp-boxes');
            this.showAlert('alert-sms-otp', 'This code has expired.', 'warning');
            const resendBtn = document.getElementById('btn-resend-sms-otp');
            if (resendBtn) {
              resendBtn.disabled = false;
              resendBtn.textContent = 'Resend New Code';
            }
          } else {
            const remaining = data.attemptsRemaining !== undefined ? ` (${data.attemptsRemaining} attempts remaining)` : '';
            this.showAlert('alert-sms-otp', `Incorrect code. Please try again.${remaining}`, 'danger');
          }
          return;
        }

        // Successfully Verified Mobile -> Transition to Step 4 (MFA Setup Choice)
        this.showView('view-register-mfa-setup');
      } catch (err) {
        console.error('SMS OTP verify error:', err);
        this.showAlert('alert-sms-otp', 'Failed to verify SMS OTP.');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify Mobile Code';
      }
    }

    async handleInitiateMfaSetup() {
      const method = this.state.selectedMfaMethod;
      const btn = document.getElementById('btn-continue-mfa-setup');
      btn.disabled = true;
      btn.textContent = 'Setting up...';

      try {
        const response = await fetch('/api/setup-mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.state.regUserId,
            method
          })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          this.showAlert('global-alert', data.error || 'Failed to setup MFA.');
          return;
        }

        this.state.regChallengeId = data.challengeId;

        if (method === 'authenticator') {
          // Display QR Code & Setup Secret
          this.state.totpSecret = data.secret;
          document.getElementById('totp-qr-image').src = data.qrCodeUrl;
          document.getElementById('totp-secret-key').textContent = data.secret;
          this.showView('view-register-authenticator-setup');
        } else {
          // SMS or Email direct verification
          this.showView('view-register-mfa-verify');
          this.setupMfaVerifyScreen(method, data.destination);
        }
      } catch (err) {
        console.error('MFA setup error:', err);
        this.showAlert('global-alert', 'Failed to configure MFA method.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Continue';
      }
    }

    setupMfaVerifyScreen(method, destination = '') {
      const title = document.getElementById('mfa-verify-title');
      const subtitle = document.getElementById('mfa-verify-subtitle');
      const resendBtn = document.getElementById('btn-resend-mfa-verify');

      this.clearOtpBoxes('mfa-verify-boxes');

      if (method === 'authenticator') {
        title.textContent = 'Verify Authenticator App';
        subtitle.textContent = 'Enter the 6-digit verification code from your Authenticator app.';
        resendBtn.style.display = 'none';
        this.startExpiryTimer('mfa-verify-timer', 600);
      } else if (method === 'sms') {
        title.textContent = 'Verify SMS Code';
        subtitle.textContent = `Enter the 6-digit code sent to ${destination || this.state.regMobile}.`;
        resendBtn.style.display = 'inline-block';
        this.startExpiryTimer('mfa-verify-timer', 300);
        this.startCooldownTimer('btn-resend-mfa-verify', null, 30);
      } else {
        title.textContent = 'Verify Email Code';
        subtitle.textContent = `Enter the 6-digit code sent to ${destination || this.state.regEmail}.`;
        resendBtn.style.display = 'inline-block';
        this.startExpiryTimer('mfa-verify-timer', 300);
        this.startCooldownTimer('btn-resend-mfa-verify', null, 30);
      }
    }

    async handleSubmitMfaVerify() {
      const otp = this.getOtpValue('mfa-verify-boxes');
      if (otp.length !== 6) {
        this.showAlert('alert-mfa-verify', 'Please enter the 6-digit verification code.');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-mfa-verify');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      try {
        const response = await fetch('/api/verify-mfa-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: this.state.regChallengeId,
            otp
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          this.highlightOtpError('mfa-verify-boxes');
          const remaining = data.attemptsRemaining !== undefined ? ` (${data.attemptsRemaining} attempts remaining)` : '';
          this.showAlert('alert-mfa-verify', `${data.error || 'Incorrect code.'}${remaining}`, 'danger');
          return;
        }

        // Successfully Registered! Transition to Step 7 (Success Screen)
        const methodName = data.user.mfaMethod === 'authenticator'
          ? 'Authenticator App (TOTP)'
          : data.user.mfaMethod === 'sms'
          ? 'SMS OTP'
          : 'Email OTP';

        document.getElementById('success-mfa-method').textContent = methodName;
        this.showView('view-register-success');
      } catch (err) {
        this.showAlert('alert-mfa-verify', 'Verification failed.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify & Complete Registration';
      }
    }

    /* ==========================================================================
       LOGIN JOURNEY IMPLEMENTATION
       ========================================================================== */
    async handleLoginSubmit(e) {
      e.preventDefault();
      this.clearAlerts();

      const emailInput = document.getElementById('login-email');
      const passwordInput = document.getElementById('login-password');
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const rememberMe = document.getElementById('login-remember').checked;

      if (!email || !password) {
        emailInput.classList.add('error');
        passwordInput.classList.add('error');
        this.showAlert('alert-login', 'Please enter your email and password.');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-login');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, rememberMe })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          // Invalid credentials state: both fields show red error borders
          emailInput.classList.add('error');
          passwordInput.classList.add('error');

          if (data.locked) {
            this.showAlert('alert-login', data.error || 'Account locked. Try again later.', 'danger');
          } else {
            this.showAlert('alert-login', 'Invalid email or password. Please try again.', 'danger');
          }
          return;
        }

        // Backend drives next screen via response shape:
        // { mfaRequired: true, method: 'email', challengeId: '...', maskedDestination: '...' }
        if (data.mfaRequired) {
          this.state.loginChallengeId = data.challengeId;
          this.state.loginMethod = data.method;

          const subtitle = document.getElementById('login-otp-subtitle');
          const resendBtn = document.getElementById('btn-resend-login-otp');

          if (data.method === 'authenticator') {
            subtitle.textContent = 'Enter the 6-digit code from your Authenticator app.';
            resendBtn.style.display = 'none';
          } else if (data.method === 'sms') {
            subtitle.textContent = `Enter the 6-digit code sent to ${data.maskedDestination || 'your phone'}.`;
            resendBtn.style.display = 'inline-block';
            this.startCooldownTimer('btn-resend-login-otp', 'login-resend-timer', 30);
          } else {
            subtitle.textContent = `Enter the 6-digit code sent to ${data.maskedDestination || 'your email'}.`;
            resendBtn.style.display = 'inline-block';
            this.startCooldownTimer('btn-resend-login-otp', 'login-resend-timer', 30);
          }

          this.clearOtpBoxes('login-otp-boxes');
          this.showView('view-login-otp');

          this.startExpiryTimer('login-otp-timer', data.expiresIn || 300, () => {
            this.clearOtpBoxes('login-otp-boxes');
            this.showAlert('alert-login-otp', 'Code expired. Please request a new code.', 'warning');
            if (resendBtn) {
              resendBtn.disabled = false;
              resendBtn.textContent = 'Resend Code';
            }
          });
        }
      } catch (err) {
        console.error('Login error:', err);
        this.showAlert('alert-login', 'Network error. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    }

    async handleVerifyLoginOtp() {
      const otp = this.getOtpValue('login-otp-boxes');
      if (otp.length !== 6) {
        this.showAlert('alert-login-otp', 'Please enter all 6 digits of the verification code.');
        return;
      }

      const verifyBtn = document.getElementById('btn-verify-login-otp');
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';

      try {
        const response = await fetch('/api/verify-login-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: this.state.loginChallengeId,
            otp
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          this.highlightOtpError('login-otp-boxes');

          if (data.maxAttemptsReached) {
            this.setOtpBoxesDisabled('login-otp-boxes', true);
            this.showAlert('alert-login-otp', 'Maximum attempts reached. Please request a new code.', 'danger');
          } else if (data.expired) {
            this.clearOtpBoxes('login-otp-boxes');
            this.showAlert('alert-login-otp', 'Code expired.', 'warning');
          } else {
            const remaining = data.attemptsRemaining !== undefined ? ` (${data.attemptsRemaining} attempts remaining)` : '';
            this.showAlert('alert-login-otp', `Incorrect code. Please try again.${remaining}`, 'danger');
          }
          return;
        }

        // Successfully authenticated! Set user state and redirect to dashboard view
        this.state.currentUser = data.user;
        this.renderDashboard(data.user, data.session);
        this.showView('view-dashboard');
      } catch (err) {
        this.showAlert('alert-login-otp', 'Verification failed.');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Sign In';
      }
    }

    async handleResendLoginOtp() {
      try {
        const response = await fetch('/api/resend-login-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: this.state.loginChallengeId
          })
        });

        const data = await response.json();
        if (data.success) {
          this.state.loginChallengeId = data.challengeId;
          this.clearOtpBoxes('login-otp-boxes');
          this.showAlert('alert-login-otp', 'A new code has been simulated and sent!', 'info');
          this.startExpiryTimer('login-otp-timer', data.expiresIn || 300);
          this.startCooldownTimer('btn-resend-login-otp', 'login-resend-timer', 30);
        }
      } catch (err) {
        this.showAlert('alert-login-otp', 'Failed to resend login code.');
      }
    }

    /* ==========================================================================
       SESSION & DASHBOARD MANAGEMENT
       ========================================================================== */
    async checkActiveSession() {
      try {
        const response = await fetch('/api/me');
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            this.state.currentUser = data.user;
            this.renderDashboard(data.user, data.session);
            this.showView('view-dashboard');
          }
        }
      } catch (err) {
        // Not authenticated, stay on login view
      }
    }

    renderDashboard(user, session) {
      document.getElementById('dash-user-name').textContent = user.fullName || 'User';
      document.getElementById('dash-user-email').textContent = user.email || '';
      document.getElementById('dash-avatar').textContent = (user.fullName || 'U')[0].toUpperCase();

      document.getElementById('meta-user-id').textContent = user.id || '-';
      document.getElementById('meta-user-mobile').textContent = `${user.countryCode || '+91'} ${user.mobile || '-'}`;
      document.getElementById('meta-mfa-method').innerHTML = `<span class="status-badge" style="padding: 2px 8px; font-size: 11px;">Active (${(user.mfaMethod || 'email').toUpperCase()})</span>`;
      document.getElementById('meta-verification-status').textContent = 'Email & Mobile Verified';
    }

    async handleLogout() {
      try {
        await fetch('/api/logout', { method: 'POST' });
        this.state.currentUser = null;
        this.state.jwtToken = null;
        this.showView('view-login');
        this.showAlert('global-alert', 'You have been safely signed out.', 'success');
      } catch (err) {
        console.error('Logout error:', err);
      }
    }

    /* ==========================================================================
       JWT AUTH PLAYGROUND (INDEPENDENT FLOW)
       ========================================================================== */
    async handleIssueJwt() {
      try {
        const response = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: this.state.currentUser?.id })
        });

        const data = await response.json();
        if (data.success && data.accessToken) {
          // Stored strictly in memory
          this.state.jwtToken = data.accessToken;

          document.getElementById('jwt-display-container').style.display = 'block';
          document.getElementById('jwt-token-preview').textContent = `Bearer ${data.accessToken}\n\nClaims:\n${JSON.stringify(data.claims, null, 2)}`;
          document.getElementById('jwt-api-response').textContent = 'Token issued! Click "Call Protected API" to make an authenticated request.';

          document.getElementById('btn-call-protected-jwt').disabled = false;
        }
      } catch (err) {
        alert('Failed to issue JWT token.');
      }
    }

    async handleCallProtectedJwt() {
      if (!this.state.jwtToken) {
        alert('Please issue a JWT token first.');
        return;
      }

      try {
        const response = await fetch('/api/protected', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.state.jwtToken}`
          }
        });

        const data = await response.json();
        document.getElementById('jwt-api-response').textContent = `Status: ${response.status} ${response.statusText}\n\n` + JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('jwt-api-response').textContent = `Error: ${err.message}`;
      }
    }

    async handleTestInvalidJwt() {
      try {
        const response = await fetch('/api/protected', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer invalid_expired_or_forged_jwt_token_example_123`
          }
        });

        const data = await response.json();
        document.getElementById('jwt-display-container').style.display = 'block';
        document.getElementById('jwt-api-response').textContent = `Status: ${response.status} Unauthorized (Expected Behavior)\n\n` + JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('jwt-api-response').textContent = `Error: ${err.message}`;
      }
    }
  }

  // Initialize Application on DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new IAMApp();
  });
})();
