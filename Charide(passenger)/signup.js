document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const strengthIndicator = document.getElementById("passwordStrength");
  const togglePasswordBtn = document.getElementById("togglePassword");
  const toggleConfirmPasswordBtn = document.getElementById("toggleConfirmPassword");

  // Password toggle functionality
  togglePasswordBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
    passwordInput.setAttribute("type", type);
    togglePasswordBtn.textContent = type === "password" ? "👁️" : "👁️‍🗨️";
  });

  toggleConfirmPasswordBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const type = confirmPasswordInput.getAttribute("type") === "password" ? "text" : "password";
    confirmPasswordInput.setAttribute("type", type);
    toggleConfirmPasswordBtn.textContent = type === "password" ? "👁️" : "👁️‍🗨️";
  });

  // Password strength checker
  function checkPasswordStrength(password) {
    let strength = 0;
    const feedback = [];

    if (password.length >= 8) strength++;
    else feedback.push("At least 8 characters");

    if (/[A-Z]/.test(password)) strength++;
    else feedback.push("Uppercase letter");

    if (/[a-z]/.test(password)) strength++;
    else feedback.push("Lowercase letter");

    if (/[0-9]/.test(password)) strength++;
    else feedback.push("Number");

    if (/[^A-Za-z0-9]/.test(password)) strength++;
    else feedback.push("Special character");

    return { strength, feedback };
  }

  // Update password strength indicator as user types
  passwordInput.addEventListener("input", function () {
    const { strength, feedback } = checkPasswordStrength(this.value);
    
    if (!this.value) {
      strengthIndicator.textContent = "Password strength will appear here";
      strengthIndicator.style.color = "#666";
      strengthIndicator.style.backgroundColor = "#f5f5f5";
      return;
    }

    let strengthText = "";
    let color = "";
    let bgColor = "";

    if (strength < 3) {
      strengthText = "❌ Weak - Add: " + feedback.join(", ");
      color = "white";
      bgColor = "#d32f2f";
    } else if (strength < 4) {
      strengthText = "⚠️ Fair - Add: " + feedback.join(", ");
      color = "white";
      bgColor = "#f57c00";
    } else if (strength === 4) {
      strengthText = "✓ Good";
      color = "white";
      bgColor = "#388e3c";
    } else {
      strengthText = "✓ Strong";
      color = "white";
      bgColor = "#1b5e20";
    }

    strengthIndicator.textContent = strengthText;
    strengthIndicator.style.color = color;
    strengthIndicator.style.backgroundColor = bgColor;
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const fullName = form.querySelector('input[placeholder="Full Name"]').value.trim();
    const email = form.querySelector('input[placeholder="Email"]').value.trim();
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();
    const mobile = form.querySelector('input[placeholder="Mobile Number"]').value.trim();
    const paymentMethod = document.getElementById('paymentMethod').value;
    const notificationsEnabled = document.getElementById('notifications').checked;

    // Basic validation
    if (!fullName || !email || !password || !confirmPassword || !mobile) {
      await Swal.fire({ icon: 'warning', title: 'Missing information', text: 'Please fill in all fields.' });
      return;
    }

    // Check password strength
    const { strength } = checkPasswordStrength(password);
    if (strength < 3) {
      await Swal.fire({ icon: 'warning', title: 'Weak password', text: 'Use at least 3 of the following: uppercase, lowercase, numbers, special characters.' });
      return;
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      await Swal.fire({ icon: 'error', title: 'Passwords do not match', text: 'Please make sure both passwords are identical.' });
      return;
    }

    if (password.length < 8) {
      await Swal.fire({ icon: 'warning', title: 'Password too short', text: 'Password must be at least 8 characters.' });
      return;
    }

    if (!/^[0-9]{10,15}$/.test(mobile)) {
      await Swal.fire({ icon: 'warning', title: 'Invalid phone number', text: 'Enter a valid mobile number (10–15 digits).' });
      return;
    }

    try {
      // Get selected user type (passenger or driver)
      const userTypeRadios = form.querySelectorAll('input[name="userType"]');
      let userType = 'passenger'; // default
      
      for (let radio of userTypeRadios) {
        if (radio.checked) {
          userType = radio.value;
          break;
        }
      }

      await apiRequest('/auth/signup', {
        method: 'POST',
        body: {
          email: email,
          password: password,
          full_name: fullName,
          phone: mobile,
          user_type: userType,
          payment_method: paymentMethod || null,
          notifications_enabled: notificationsEnabled
        }
      });

      await Swal.fire({
        title: `Welcome, ${fullName}`,
        icon: 'success',
        showConfirmButton: true,
        confirmButtonText: 'Go to login',
        background: '#ffffff',
        color: '#0b2b24'
      }).then(() => {
        window.location.href = 'login.html';
      });
      return;

    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'An unexpected error occurred.' });
    }
  });
});
