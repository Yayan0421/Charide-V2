const email = document.getElementById("loginEmail");
const password = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const togglePasswordBtn = document.getElementById("togglePassword");

function validateLogin() {
  loginBtn.disabled = !(email.value.trim() && password.value.trim());
}

email.addEventListener("input", validateLogin);
password.addEventListener("input", validateLogin);

// Password toggle functionality
togglePasswordBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const type = password.getAttribute("type") === "password" ? "text" : "password";
  password.setAttribute("type", type);
  togglePasswordBtn.textContent = type === "password" ? "👁️" : "👁️‍🗨️";
});

// Backend Login
loginBtn.addEventListener("click", async () => {
  if (!email.value || !password.value) return;

  try {
    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";

    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: {
        email: email.value.trim(),
        password: password.value.trim()
      }
    });

    setAuthToken(data.token);
    if (data.refresh_token) {
      setRefreshToken(data.refresh_token);
    }
    setCurrentUser(data.user);

    const signedUser = data && data.user ? data.user : null;
    const displayName = signedUser?.full_name || (signedUser?.email ? signedUser.email.split('@')[0] : 'Passenger');

    await Swal.fire({
      title: `Welcome, ${displayName}`,
      icon: 'success',
      timer: 1300,
      showConfirmButton: false,
      background: '#ffffff',
      color: '#0b2b24'
    });

    // redirect after popup
    window.location.href = 'dashboard.html';

  } catch (err) {
    await Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'An unexpected error occurred.' });
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
});
