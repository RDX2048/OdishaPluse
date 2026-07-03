const SESSION_KEY = "odishapulse_session";
const REMEMBER_KEY = "odishapulse_remembered";
const EMAIL_KEY = "odishapulse_email";

if (localStorage.getItem(REMEMBER_KEY) === "true") {
  window.location.href = "home.html";
}

function simulateNetworkDelay(ms = 500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

document.addEventListener("DOMContentLoaded", () => {
  buildHeatGrid();
  setupTabs();
  setupPasswordToggles();
  setupStrengthMeter();
  setupLoginForm();
  setupSignupForm();
});

function buildHeatGrid() {
  const grid = document.getElementById("heat-grid");
  if (!grid) return;

  const TOTAL_CELLS = 96; 
  const levels = ["low", "low", "low", "mid", "mid", "high"];

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  for (let i = 0; i < TOTAL_CELLS; i++) {
    const cell = document.createElement("div");
    const level = levels[Math.floor(Math.random() * levels.length)];
    cell.className = `cell cell--${level}`;

    if (!reducedMotion) {
      const delay = (Math.random() * 5).toFixed(2);
      const duration = (4 + Math.random() * 3).toFixed(2);
      cell.style.animationDelay = `${delay}s`;
      cell.style.animationDuration = `${duration}s`;
    }

    grid.appendChild(cell);
  }
}

function setupTabs() {
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const goSignup = document.getElementById("go-signup");
  const goLogin = document.getElementById("go-login");
  const status = document.getElementById("form-status");

  function showLogin() {
    loginForm.hidden = false;
    signupForm.hidden = true;
    tabLogin.classList.add("tab--active");
    tabSignup.classList.remove("tab--active");
    tabLogin.setAttribute("aria-selected", "true");
    tabSignup.setAttribute("aria-selected", "false");
    clearStatus(status);
  }

  function showSignup() {
    signupForm.hidden = false;
    loginForm.hidden = true;
    tabSignup.classList.add("tab--active");
    tabLogin.classList.remove("tab--active");
    tabSignup.setAttribute("aria-selected", "true");
    tabLogin.setAttribute("aria-selected", "false");
    clearStatus(status);
  }

  tabLogin.addEventListener("click", showLogin);
  tabSignup.addEventListener("click", showSignup);
  goSignup.addEventListener("click", showSignup);
  goLogin.addEventListener("click", showLogin);
}


function setupPasswordToggles() {
  document.querySelectorAll(".toggle-visibility").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      const isHidden = input.type === "password";

      input.type = isHidden ? "text" : "password";
      btn.textContent = isHidden ? "Hide" : "Show";
      btn.setAttribute("aria-pressed", String(isHidden));
    });
  });
}

function setupStrengthMeter() {
  const passwordInput = document.getElementById("signup-password");
  const meterBar = document.querySelector("#strength-meter span");
  if (!passwordInput || !meterBar) return;

  passwordInput.addEventListener("input", () => {
    const { score } = scorePassword(passwordInput.value);

    if (score <= 1) {
      meterBar.style.width = "30%";
      meterBar.style.background = "var(--crimson)";
    } else if (score === 2) {
      meterBar.style.width = "65%";
      meterBar.style.background = "var(--amber)";
    } else {
      meterBar.style.width = "100%";
      meterBar.style.background = "var(--teal)";
    }
  });
}

function scorePassword(value) {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  return { score };
}

function setupLoginForm() {
  const form = document.getElementById("login-form");
  const status = document.getElementById("form-status");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus(status);

    const email = form.email.value.trim();
    const password = form.password.value;

    let valid = true;

    if (!isValidEmail(email)) {
      showFieldError("login-email", "Enter a valid email address.");
      valid = false;
    } else {
      hideFieldError("login-email");
    }

    if (password.length === 0) {
      showFieldError("login-password", "Enter your password.");
      valid = false;
    } else {
      hideFieldError("login-password");
    }

    if (!valid) return;

    const submitBtn = form.querySelector(".btn-primary");
    toggleLoading(submitBtn, true, "Sign in", "Signing in…");

    const remember = document.getElementById("remember-me").checked;

    await simulateNetworkDelay();

    sessionStorage.setItem(SESSION_KEY, "true");

    if (remember) {
      localStorage.setItem(REMEMBER_KEY, "true");
      localStorage.setItem(EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }

    setStatus(status, "Signed in successfully. Redirecting…", "success");
    window.location.href = "home.html";
  });
}

function setupSignupForm() {
  const form = document.getElementById("signup-form");
  const status = document.getElementById("form-status");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus(status);

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const region = form.region.value;
    const password = form.password.value;
    const confirm = form.confirm.value;

    let valid = true;

    if (name.length < 2) {
      showFieldError("signup-name", "Enter your full name.");
      valid = false;
    } else {
      hideFieldError("signup-name");
    }

    if (!isValidEmail(email)) {
      showFieldError("signup-email", "Enter a valid email address.");
      valid = false;
    } else {
      hideFieldError("signup-email");
    }

    if (phone.length > 0 && !/^\d{10}$/.test(phone)) {
      showFieldError("signup-phone", "Enter a 10-digit phone number.");
      valid = false;
    } else {
      hideFieldError("signup-phone");
    }

    if (!region) {
      showFieldError("signup-region", "Select your primary region.");
      valid = false;
    } else {
      hideFieldError("signup-region");
    }

    if (password.length < 8) {
      showFieldError("signup-password", "Use at least 8 characters.");
      valid = false;
    } else {
      hideFieldError("signup-password");
    }

    if (confirm !== password || confirm.length === 0) {
      showFieldError("signup-confirm", "Passwords do not match.");
      valid = false;
    } else {
      hideFieldError("signup-confirm");
    }

    if (!valid) return;

    const submitBtn = form.querySelector(".btn-primary");
    toggleLoading(submitBtn, true, "Create account", "Creating account…");

    await simulateNetworkDelay();

    sessionStorage.setItem(SESSION_KEY, "true");
    localStorage.setItem(REMEMBER_KEY, "true");
    localStorage.setItem(EMAIL_KEY, email);

    setStatus(status, "Account created. Redirecting…", "success");
    window.location.href = "home.html";
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function showFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(`${inputId}-error`);
  if (input) input.classList.add("invalid");
  if (error) {
    error.textContent = message;
    error.classList.add("visible");
  }
}

function hideFieldError(inputId) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(`${inputId}-error`);
  if (input) input.classList.remove("invalid");
  if (error) {
    error.textContent = "";
    error.classList.remove("visible");
  }
}

function setStatus(statusEl, message, type) {
  statusEl.textContent = message;
  statusEl.className = `form-status ${type}`;
}

function clearStatus(statusEl) {
  statusEl.textContent = "";
  statusEl.className = "form-status";
}

function toggleLoading(button, isLoading, idleText, loadingText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : idleText;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}