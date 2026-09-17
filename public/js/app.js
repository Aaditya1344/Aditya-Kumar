/**
 * SECUREID CLIENT CONTROLLER
 * Pure Vanilla JavaScript implementation matching reference specifications
 */

(function () {
  'use strict';

  class IAMController {
    constructor() {
      this.state = {
        currentUser: null,
        regUserId: null,
        regChallengeId: null,
        regEmail: 'priya.sharma@email.com',
        regMobile: '98765 43210',
        regCountryCode: '+91',
        regMfaMethod: 'authenticator',
        totpSecret: null,
        loginChallengeId: null,
        loginMfaMethod: 'email',
        loginEmail: 'priya.sharma@email.com',
        jwtToken: null
      };

      this.activeTimers = {};
      this.init();
    }

    init() {
      this.bindEvents();
      this.setupOtpInputBoxes();
      this.setupPasswordValidator();
      this.checkSession();
    }

    /* ==========================================================================
       CONTAINER & VIEW SWITCHING
       ========================================================================== */
    showLoginView() {
      document.getElementById('card-registration-container').style.display = 'none';
      document.getElementById('card-dashboard-container').style.display = 'none';
      document.getElementById('card-login-container').style.display = 'flex';
      this.showView('view-login-form');
    }

    showRegView() {
      document.getElementById('card-login-container').style.display = 'none';
      document.getElementById('card-dashboard-container').style.display = 'none';
      document.getElementById('card-registration-container').style.display = 'block';
      this.showView('view-reg-details');
    }

    showDashboardView() {
      document.getElementById('card-registration-container').style.display = 'none';
      document.getElementById('card-login-container').style.display = 'none';
      document.getElementById('card-dashboard-container').style.display = 'block';
    }

    showView(viewId) {
      document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
      const target = document.getElementById(viewId);
      if (target) {
        target.classList.add('active');
        this.updateStepIndicator(viewId);
        
        // Auto-focus first input box
        const firstInput = target.querySelector('input:not([type=hidden])');
        if (firstInput) {
          setTimeout(() => firstInput.focus(), 80);
        }
      }
    }

    updateStepIndicator(viewId) {
      const stepTitle = document.getElementById('reg-step-title');
      const dots = [1, 2, 3, 4, 5].map(n => document.getElementById(`dot-step-${n}`));

      dots.forEach(d => { if (d) d.className = 'step-dot'; });

      if (viewId === 'view-reg-details') {
        if (stepTitle) stepTitle.textContent = '1. Register - Details';
        if (dots[0]) dots[0].className = 'step-dot active';
      } else if (viewId === 'view-reg-email-otp') {
        if (stepTitle) stepTitle.textContent = '2. Email Verification - OTP';
        if (dots[0]) dots[0].className = 'step-dot completed';
        if (dots[1]) dots[1].className = 'step-dot active';
      } else if (viewId === 'view-reg-sms-otp') {
        if (stepTitle) stepTitle.textContent = '3. Mobile Verification - OTP';
        if (dots[0]) dots[0].className = 'step-dot completed';
        if (dots[1]) dots[1].className = 'step-dot completed';
        if (dots[2]) dots[2].className = 'step-dot active';
      } else if (viewId === 'view-reg-mfa-setup' || viewId === 'view-reg-auth-setup') {
        if (stepTitle) stepTitle.textContent = '4. Authenticator Setup';
        if (dots[0]) dots[0].className = 'step-dot completed';
        if (dots[1]) dots[1].className = 'step-dot completed';
        if (dots[2]) dots[2].className = 'step-dot completed';
        if (dots[3]) dots[3].className = 'step-dot active';
      } else if (viewId === 'view-reg-mfa-verify' || viewId === 'view-reg-success') {
        if (stepTitle) stepTitle.textContent = '5. Registration Success';
        dots.forEach(d => { if (d) d.className = 'step-dot completed'; });
        if (dots[4]) dots[4].className = 'step-dot active';
      }
    }

    /* ==========================================================================
       6-DIGIT OTP BOXES HANDLER
       ========================================================================== */
    setupOtpInputBoxes() {
      const containerIds = ['boxes-reg-email', 'boxes-reg-sms', 'boxes-reg-mfa-verify', 'boxes-login-otp'];

      containerIds.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        const inputs = container.querySelectorAll('.otp-digit-box');

        inputs.forEach((input, idx) => {
          input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val ? val[0] : '';
            if (val && idx < inputs.length - 1) {
              inputs[idx + 1].focus();
            }

            // Auto-trigger verify when all 6 digits entered
            const fullCode = this.getOtpCode(id);
            if (fullCode.length === 6) {
              this.handleAutoSubmitOtp(id);
            }
          });

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && idx > 0) {
              inputs[idx - 1].focus();
            } else if (e.key === 'ArrowLeft' && idx > 0) {
              inputs[idx - 1].focus();
            } else if (e.key === 'ArrowRight' && idx < inputs.length - 1) {
              inputs[idx + 1].focus();
            }
          });

          input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text').trim();
            const digits = text.replace(/\D/g, '').slice(0, 6);
            if (digits) {
              for (let i = 0; i < inputs.length; i++) {
                inputs[i].value = digits[i] || '';
              }
              const lastIdx = Math.min(digits.length, inputs.length) - 1;
              if (lastIdx >= 0) inputs[lastIdx].focus();

              if (digits.length === 6) {
                this.handleAutoSubmitOtp(id);
              }
            }
          });
        });
      });
    }

    getOtpCode(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return '';
      let code = '';
      container.querySelectorAll('.otp-digit-box').forEach(b => code += b.value.trim());
      return code;
    }

    clearOtpBoxes(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll('.otp-digit-box').forEach(b => {
        b.value = '';
        b.classList.remove('error');
        b.disabled = false;
      });
      const first = container.querySelector('.otp-digit-box');
      if (first) first.focus();
    }

    highlightOtpError(containerId, lastOnly = true) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const boxes = container.querySelectorAll('.otp-digit-box');
      if (lastOnly && boxes.length > 0) {
        boxes[boxes.length - 1].classList.add('error');
      } else {
        boxes.forEach(b => b.classList.add('error'));
      }
    }

    /* ==========================================================================
       TIMERS & COUNTDOWNS
       ========================================================================== */
    startExpiryTimer(elementId, seconds, onExpired) {
      if (this.activeTimers[elementId]) {
        clearInterval(this.activeTimers[elementId]);
      }

      let remaining = seconds;
      const el = document.getElementById(elementId);

      const tick = () => {
        const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
        const ss = String(remaining % 60).padStart(2, '0');
        if (el) el.textContent = `${mm}:${ss}`;

        if (remaining <= 0) {
          clearInterval(this.activeTimers[elementId]);
          if (onExpired) onExpired();
        }
        remaining--;
      };

      tick();
      this.activeTimers[elementId] = setInterval(tick, 1000);
    }

    startCooldownTimer(btnId, spanId, cooldownSec = 25) {
      const btn = document.getElementById(btnId);
      const span = document.getElementById(spanId);
      if (!btn) return;

      btn.disabled = true;
      let remaining = cooldownSec;

      const interval = setInterval(() => {
        remaining--;
        const ss = String(remaining).padStart(2, '0');
        if (span) span.textContent = `00:${ss}`;

        if (remaining <= 0) {
          clearInterval(interval);
          btn.disabled = false;
          if (span) span.textContent = '00:00';
          btn.textContent = 'Resend code';
        }
      }, 1000);
    }

    /* ==========================================================================
       PASSWORD VALIDATION CHECKLIST
       ========================================================================== */
    setupPasswordValidator() {
      const pwdInput = document.getElementById('reg-password');
      if (!pwdInput) return;

      pwdInput.addEventListener('input', () => {
        const val = pwdInput.value;
        this.setCheckItem('pwd-req-len', val.length >= 8);
        this.setCheckItem('pwd-req-upper', /[A-Z]/.test(val));
        this.setCheckItem('pwd-req-num', /[0-9]/.test(val));
        this.setCheckItem('pwd-req-spec', /[^A-Za-z0-9]/.test(val));
      });
    }

    setCheckItem(id, valid) {
      const el = document.getElementById(id);
      if (el) {
        if (valid) el.classList.add('valid');
        else el.classList.remove('valid');
      }
    }

    /* ==========================================================================
       EVENT BINDINGS
       ========================================================================== */
    bindEvents() {
      // Password toggles
      document.querySelectorAll('.toggle-password-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          const input = document.getElementById(targetId);
          if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
          }
        });
      });

      // 1. Register Details Form
      const formReg = document.getElementById('form-register-details');
      if (formReg) {
        formReg.addEventListener('submit', (e) => this.handleRegisterSubmit(e));
      }

      // Resend Email OTP
      const btnResendRegEmail = document.getElementById('btn-resend-reg-email');
      if (btnResendRegEmail) {
        btnResendRegEmail.addEventListener('click', () => this.handleResendEmailOtp());
      }
      const btnResendNewEmail = document.getElementById('btn-resend-new-email');
      if (btnResendNewEmail) {
        btnResendNewEmail.addEventListener('click', () => this.handleResendEmailOtp());
      }

      // Inline Mobile Update Toggle
      const linkChangePhone = document.getElementById('link-change-mobile-toggle');
      if (linkChangePhone) {
        linkChangePhone.addEventListener('click', (e) => {
          e.preventDefault();
          const box = document.getElementById('box-inline-change-phone');
          box.style.display = box.style.display === 'none' ? 'block' : 'none';
        });
      }

      const btnSavePhone = document.getElementById('btn-save-mobile-val');
      if (btnSavePhone) {
        btnSavePhone.addEventListener('click', () => this.handleUpdateMobileAndResend());
      }

      // Resend SMS OTP
      const btnResendRegSms = document.getElementById('btn-resend-reg-sms');
      if (btnResendRegSms) {
        btnResendRegSms.addEventListener('click', () => this.handleResendSmsOtp());
      }
      const btnResendNewSms = document.getElementById('btn-resend-new-sms');
      if (btnResendNewSms) {
        btnResendNewSms.addEventListener('click', () => this.handleResendSmsOtp());
      }

      // MFA Method Card Selection
      document.querySelectorAll('.mfa-card-item').forEach(card => {
        card.addEventListener('click', () => {
          const parent = card.parentElement;
          parent.querySelectorAll('.mfa-card-item').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          const method = card.getAttribute('data-method');
          if (parent.closest('#view-reg-mfa-setup')) {
            this.state.regMfaMethod = method;
          } else {
            this.state.loginMfaMethod = method;
          }
        });
      });

      // Continue MFA Choice (Register)
      const btnContinueMfaChoice = document.getElementById('btn-continue-mfa-choice');
      if (btnContinueMfaChoice) {
        btnContinueMfaChoice.addEventListener('click', () => this.handleSetupMfa());
      }

      // Authenticator Secret Toggle
      const btnToggleKey = document.getElementById('btn-toggle-setup-key');
      if (btnToggleKey) {
        btnToggleKey.addEventListener('click', (e) => {
          e.preventDefault();
          const box = document.getElementById('box-secret-key');
          box.style.display = box.style.display === 'none' ? 'block' : 'none';
        });
      }

      const btnContinueToMfaVerify = document.getElementById('btn-continue-to-mfa-verify');
      if (btnContinueToMfaVerify) {
        btnContinueToMfaVerify.addEventListener('click', () => {
          this.showView('view-reg-mfa-verify');
          this.startExpiryTimer('timer-reg-mfa', 28);
        });
      }

      // 2. Login Form
      const formLogin = document.getElementById('form-login-credentials');
      if (formLogin) {
        formLogin.addEventListener('submit', (e) => this.handleLoginSubmit(e));
      }

      // Continue Login Method
      const btnLoginMethodContinue = document.getElementById('btn-login-method-continue');
      if (btnLoginMethodContinue) {
        btnLoginMethodContinue.addEventListener('click', () => {
          this.showView('view-login-otp-screen');
        });
      }

      // Resend Login OTP
      const btnResendLogin = document.getElementById('btn-resend-login-otp');
      if (btnResendLogin) {
        btnResendLogin.addEventListener('click', () => this.handleResendLoginOtp());
      }
      const btnResendExpiredLogin = document.getElementById('btn-resend-expired-login');
      if (btnResendExpiredLogin) {
        btnResendExpiredLogin.addEventListener('click', () => this.handleResendLoginOtp());
      }
    }

    /* ==========================================================================
       AUTO SUBMIT OTP ON 6 DIGITS
       ========================================================================== */
    handleAutoSubmitOtp(containerId) {
      if (containerId === 'boxes-reg-email') {
        this.handleVerifyEmailOtp();
      } else if (containerId === 'boxes-reg-sms') {
        this.handleVerifySmsOtp();
      } else if (containerId === 'boxes-reg-mfa-verify') {
        this.handleVerifyMfaSetup();
      } else if (containerId === 'boxes-login-otp') {
        this.handleVerifyLoginOtp();
      }
    }

    /* ==========================================================================
       REGISTRATION FLOW ACTIONS
       ========================================================================== */
    async handleRegisterSubmit(e) {
      e.preventDefault();
      const fullName = document.getElementById('reg-fullname').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const mobile = document.getElementById('reg-mobile').value.trim();
      const countryCode = document.getElementById('reg-country-code').value;
      const password = document.getElementById('reg-password').value;
      const terms = document.getElementById('reg-terms').checked;

      if (!fullName || !email || !mobile || !password || !terms) {
        alert('Please complete all fields and accept the Terms.');
        return;
      }

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, email, mobile, countryCode, password, terms })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          alert(data.error || 'Registration failed');
          return;
        }

        this.state.regChallengeId = data.challengeId;
        this.state.regEmail = data.email;
        this.state.regMobile = `${countryCode} ${mobile}`;

        document.getElementById('label-email-dest').textContent = data.email;
        this.clearOtpBoxes('boxes-reg-email');
        this.showView('view-reg-email-otp');

        // Start 02:45 Expiry and 00:25 Cooldown
        this.startExpiryTimer('timer-reg-email', 165, () => {
          document.getElementById('badge-email-otp').className = 'icon-badge icon-badge-red';
          document.getElementById('expired-reg-email-banner').classList.add('active');
          document.getElementById('btn-resend-new-email').style.display = 'block';
          this.clearOtpBoxes('boxes-reg-email');
        });
        this.startCooldownTimer('btn-resend-reg-email', 'cooldown-reg-email', 25);
      } catch (err) {
        alert('Registration request error');
      }
    }

    async handleVerifyEmailOtp() {
      const otp = this.getOtpCode('boxes-reg-email');
      if (otp.length !== 6) return;

      try {
        const res = await fetch('/api/verify-email-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: this.state.regChallengeId, otp })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          // Highlight Wrong Code State
          document.getElementById('badge-email-otp').className = 'icon-badge icon-badge-red';
          this.highlightOtpError('boxes-reg-email', true);
          const errEl = document.getElementById('error-reg-email-otp');
          errEl.classList.add('active');
          const attEl = document.getElementById('attempts-reg-email');
          if (attEl && data.attemptsRemaining !== undefined) {
            attEl.textContent = `You have ${data.attemptsRemaining} attempt${data.attemptsRemaining === 1 ? '' : 's'} left.`;
          }
          return;
        }

        // Email Verified -> Transition to Mobile OTP
        this.state.regUserId = data.userId;
        this.state.regChallengeId = data.challengeId;
        document.getElementById('label-sms-dest').textContent = `${data.countryCode} ${data.mobile}`;

        this.clearOtpBoxes('boxes-reg-sms');
        this.showView('view-reg-sms-otp');

        this.startExpiryTimer('timer-reg-sms', 165, () => {
          document.getElementById('badge-sms-otp').className = 'icon-badge icon-badge-red';
          document.getElementById('btn-resend-new-sms').style.display = 'block';
          this.clearOtpBoxes('boxes-reg-sms');
        });
        this.startCooldownTimer('btn-resend-reg-sms', 'cooldown-reg-sms', 25);
      } catch (err) {
        console.error(err);
      }
    }

    async handleResendEmailOtp() {
      try {
        const res = await fetch('/api/send-email-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: this.state.regChallengeId, email: this.state.regEmail, userId: this.state.regUserId })
        });
        const data = await res.json();
        if (data.success) {
          this.state.regChallengeId = data.challengeId;
          document.getElementById('badge-email-otp').className = 'icon-badge icon-badge-blue';
          document.getElementById('error-reg-email-otp').classList.remove('active');
          document.getElementById('expired-reg-email-banner').classList.remove('active');
          document.getElementById('btn-resend-new-email').style.display = 'none';
          this.clearOtpBoxes('boxes-reg-email');

          this.startExpiryTimer('timer-reg-email', 165);
          this.startCooldownTimer('btn-resend-reg-email', 'cooldown-reg-email', 25);
        }
      } catch (e) { alert('Resend failed'); }
    }

    async handleVerifySmsOtp() {
      const otp = this.getOtpCode('boxes-reg-sms');
      if (otp.length !== 6) return;

      try {
        const res = await fetch('/api/verify-sms-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: this.state.regChallengeId, otp })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          document.getElementById('badge-sms-otp').className = 'icon-badge icon-badge-red';
          this.highlightOtpError('boxes-reg-sms', true);

          if (data.maxAttemptsReached) {
            document.getElementById('max-attempts-sms-banner').classList.add('active');
            document.getElementById('btn-resend-new-sms').style.display = 'block';
          } else {
            const errEl = document.getElementById('error-reg-sms-otp');
            errEl.classList.add('active');
            const attEl = document.getElementById('attempts-reg-sms');
            if (attEl && data.attemptsRemaining !== undefined) {
              attEl.textContent = `You have ${data.attemptsRemaining} attempt${data.attemptsRemaining === 1 ? '' : 's'} left.`;
            }
          }
          return;
        }

        // SMS Verified -> Move to Step 4 (Set Up MFA)
        this.showView('view-reg-mfa-setup');
      } catch (err) { console.error(err); }
    }

    async handleUpdateMobileAndResend() {
      const newPhone = document.getElementById('input-update-mobile-val').value.trim();
      if (!newPhone) return;
      this.state.regMobile = newPhone;
      document.getElementById('label-sms-dest').textContent = newPhone;
      document.getElementById('box-inline-change-phone').style.display = 'none';
      await this.handleResendSmsOtp(newPhone);
    }

    async handleResendSmsOtp(phoneVal = null) {
      try {
        const res = await fetch('/api/send-sms-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: this.state.regChallengeId, userId: this.state.regUserId, mobile: phoneVal || this.state.regMobile })
        });
        const data = await res.json();
        if (data.success) {
          this.state.regChallengeId = data.challengeId;
          document.getElementById('badge-sms-otp').className = 'icon-badge icon-badge-green';
          document.getElementById('error-reg-sms-otp').classList.remove('active');
          document.getElementById('max-attempts-sms-banner').classList.remove('active');
          document.getElementById('btn-resend-new-sms').style.display = 'none';
          this.clearOtpBoxes('boxes-reg-sms');

          this.startExpiryTimer('timer-reg-sms', 165);
          this.startCooldownTimer('btn-resend-reg-sms', 'cooldown-reg-sms', 25);
        }
      } catch (e) { alert('Resend failed'); }
    }

    async handleSetupMfa() {
      const method = this.state.regMfaMethod;
      try {
        const res = await fetch('/api/setup-mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: this.state.regUserId, method })
        });
        const data = await res.json();

        if (data.success) {
          this.state.regChallengeId = data.challengeId;
          if (method === 'authenticator') {
            this.state.totpSecret = data.secret;
            document.getElementById('reg-qr-img').src = data.qrCodeUrl;
            document.getElementById('reg-secret-key-text').textContent = data.secret;
            this.showView('view-reg-auth-setup');
          } else {
            this.showView('view-reg-mfa-verify');
            document.getElementById('subtitle-mfa-verify').textContent = `Enter the 6-digit code sent to ${data.destination}`;
            this.startExpiryTimer('timer-reg-mfa', 28);
          }
        }
      } catch (e) { alert('MFA setup error'); }
    }

    async handleVerifyMfaSetup() {
      const otp = this.getOtpCode('boxes-reg-mfa-verify');
      if (otp.length !== 6) return;

      try {
        const res = await fetch('/api/verify-mfa-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: this.state.regChallengeId, otp })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          document.getElementById('badge-mfa-verify').className = 'icon-badge icon-badge-red';
          this.highlightOtpError('boxes-reg-mfa-verify', false);
          document.getElementById('error-reg-mfa-otp').classList.add('active');
          return;
        }

        // Complete Registration Success
        this.showView('view-reg-success');
      } catch (e) { console.error(e); }
    }

    /* ==========================================================================
       LOGIN FLOW ACTIONS
       ========================================================================== */
    async handleLoginSubmit(e) {
      e.preventDefault();
      const emailInput = document.getElementById('login-email');
      const passwordInput = document.getElementById('login-password');
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const rememberMe = document.getElementById('login-remember').checked;

      if (!email || !password) return;

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, rememberMe })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          // Invalid credentials view state matching mockup:
          document.getElementById('badge-login-state').className = 'icon-badge icon-badge-red';
          emailInput.classList.add('error');
          passwordInput.classList.add('error');
          document.getElementById('login-email-err-icon').style.display = 'flex';
          document.getElementById('login-error-msg').classList.add('active');
          return;
        }

        // Reset error state
        emailInput.classList.remove('error');
        passwordInput.classList.remove('error');
        document.getElementById('login-email-err-icon').style.display = 'none';
        document.getElementById('login-error-msg').classList.remove('active');

        this.state.loginChallengeId = data.challengeId;
        this.state.loginMfaMethod = data.method;
        this.state.loginEmail = email;

        // Populate and open Login OTP view
        document.getElementById('label-login-otp-dest').textContent = data.maskedDestination || email;
        document.getElementById('title-login-otp').textContent = data.method === 'authenticator'
          ? 'Authenticator Verification'
          : data.method === 'sms'
          ? 'SMS Verification'
          : 'Email Verification';

        this.clearOtpBoxes('boxes-login-otp');
        this.showView('view-login-otp-screen');

        this.startExpiryTimer('timer-login-otp', 165, () => {
          document.getElementById('expired-login-otp-msg').classList.add('active');
          document.getElementById('btn-resend-expired-login').style.display = 'block';
          document.getElementById('cooldown-request-new-text').style.display = 'block';
          this.startExpiryTimer('span-request-cooldown', 28);
          this.clearOtpBoxes('boxes-login-otp');
        });
        this.startCooldownTimer('btn-resend-login-otp', 'cooldown-login-otp', 25);
      } catch (err) { alert('Login error'); }
    }

    async handleVerifyLoginOtp() {
      const otp = this.getOtpCode('boxes-login-otp');
      if (otp.length !== 6) return;

      try {
        const res = await fetch('/api/verify-login-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: this.state.loginChallengeId, otp })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          this.highlightOtpError('boxes-login-otp', true);
          const errEl = document.getElementById('error-login-otp');
          errEl.classList.add('active');
          const attEl = document.getElementById('attempts-login-otp');
          if (attEl && data.attemptsRemaining !== undefined) {
            attEl.textContent = `You have ${data.attemptsRemaining} attempt${data.attemptsRemaining === 1 ? '' : 's'} left.`;
          }
          return;
        }

        // Successfully Logged In
        this.state.currentUser = data.user;
        this.renderDashboard(data.user);
        this.showDashboardView();
      } catch (err) { console.error(err); }
    }

    async handleResendLoginOtp() {
      try {
        const res = await fetch('/api/resend-login-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: this.state.loginChallengeId })
        });
        const data = await res.json();
        if (data.success) {
          this.state.loginChallengeId = data.challengeId;
          document.getElementById('error-login-otp').classList.remove('active');
          document.getElementById('expired-login-otp-msg').classList.remove('active');
          document.getElementById('btn-resend-expired-login').style.display = 'none';
          document.getElementById('cooldown-request-new-text').style.display = 'none';
          this.clearOtpBoxes('boxes-login-otp');

          this.startExpiryTimer('timer-login-otp', 165);
          this.startCooldownTimer('btn-resend-login-otp', 'cooldown-login-otp', 25);
        }
      } catch (e) { alert('Resend failed'); }
    }

    /* ==========================================================================
       SESSION & JWT PLAYGROUND
       ========================================================================== */
    async checkSession() {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            this.state.currentUser = data.user;
            this.renderDashboard(data.user);
            this.showDashboardView();
          }
        }
      } catch (e) { /* unauthenticated */ }
    }

    renderDashboard(user) {
      document.getElementById('dash-full-name').textContent = user.fullName || 'User';
      document.getElementById('dash-email-address').textContent = user.email || '';
      document.getElementById('dash-avatar-circle').textContent = (user.fullName || 'U')[0].toUpperCase();
      document.getElementById('dash-meta-id').textContent = user.id || '-';
      document.getElementById('dash-meta-mobile').textContent = `${user.countryCode || '+91'} ${user.mobile || '-'}`;
      document.getElementById('dash-meta-mfa').textContent = `Enabled (${(user.mfaMethod || 'TOTP').toUpperCase()})`;
    }

    async handleLogout() {
      await fetch('/api/logout', { method: 'POST' });
      this.state.currentUser = null;
      this.state.jwtToken = null;
      this.showLoginView();
    }

    async handleIssueJwt() {
      try {
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: this.state.currentUser?.id })
        });
        const data = await res.json();
        if (data.success) {
          this.state.jwtToken = data.accessToken;
          document.getElementById('jwt-output-box').style.display = 'block';
          document.getElementById('jwt-output-text').textContent = `Issued JWT Token:\n${data.accessToken}\n\nClaims:\n${JSON.stringify(data.claims, null, 2)}`;
          document.getElementById('btn-dash-call-protected').disabled = false;
        }
      } catch (e) { alert('Failed to issue JWT'); }
    }

    async handleCallProtectedJwt() {
      if (!this.state.jwtToken) return;
      try {
        const res = await fetch('/api/protected', {
          headers: { 'Authorization': `Bearer ${this.state.jwtToken}` }
        });
        const data = await res.json();
        document.getElementById('jwt-output-box').style.display = 'block';
        document.getElementById('jwt-output-text').textContent = `Status: ${res.status} OK\n\n` + JSON.stringify(data, null, 2);
      } catch (e) { alert('API call failed'); }
    }

    async handleTestInvalidJwt() {
      try {
        const res = await fetch('/api/protected', {
          headers: { 'Authorization': 'Bearer invalid_forged_token' }
        });
        const data = await res.json();
        document.getElementById('jwt-output-box').style.display = 'block';
        document.getElementById('jwt-output-text').textContent = `Status: ${res.status} Unauthorized (401 Rejection)\n\n` + JSON.stringify(data, null, 2);
      } catch (e) { alert('API call failed'); }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.app = new IAMController();
  });
})();
