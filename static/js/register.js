// Registration Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registrationForm');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const nameError = document.getElementById('nameError');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const submitButton = form.querySelector('button[type="submit"]');
    const buttonText = submitButton.querySelector('.btn-text');
    const buttonLoader = submitButton.querySelector('.btn-loading');

    // Fixed password for validation
    const CORRECT_PASSWORD = 'test@1234@test@456';

    // Form validation
    function validateName() {
        const name = nameInput.value.trim();
        if (!name) {
            nameError.textContent = 'Name is required';
            nameError.style.display = 'block';
            return false;
        }
        if (name.length < 2) {
            nameError.textContent = 'Name must be at least 2 characters long';
            nameError.style.display = 'block';
            return false;
        }
        nameError.style.display = 'none';
        return true;
    }

    function validateEmail() {
        const email = emailInput.value.trim();
        if (!email) {
            emailError.textContent = 'Email is required';
            emailError.style.display = 'block';
            return false;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            emailError.textContent = 'Please enter a valid email address';
            emailError.style.display = 'block';
            return false;
        }
        emailError.style.display = 'none';
        return true;
    }

    function validatePassword() {
        const password = passwordInput.value;
        if (!password) {
            passwordError.textContent = 'Password is required';
            passwordError.style.display = 'block';
            return false;
        }
        if (password !== CORRECT_PASSWORD) {
            passwordError.textContent = 'Please provide the correct password to continue.';
            passwordError.style.display = 'block';
            return false;
        }
        passwordError.style.display = 'none';
        return true;
    }

    // Real-time validation
    nameInput.addEventListener('blur', validateName);
    emailInput.addEventListener('blur', validateEmail);
    passwordInput.addEventListener('blur', validatePassword);
    
    nameInput.addEventListener('input', function() {
        if (nameError.style.display === 'block') {
            validateName();
        }
    });

    emailInput.addEventListener('input', function() {
        if (emailError.style.display === 'block') {
            validateEmail();
        }
    });

    passwordInput.addEventListener('input', function() {
        if (passwordError.style.display === 'block') {
            validatePassword();
        }
    });

    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validate all fields
        const isNameValid = validateName();
        const isEmailValid = validateEmail();
        const isPasswordValid = validatePassword();

        if (!isNameValid || !isEmailValid || !isPasswordValid) {
            return;
        }

        // Show loading state
        submitButton.disabled = true;
        buttonText.style.display = 'none';
        buttonLoader.style.display = 'flex';

        try {
            // Store user name in localStorage for persistence
            const userName = nameInput.value.trim();
            const userEmail = emailInput.value.trim();
            
            // Store in localStorage for career counselor to use
            localStorage.setItem('user_name', userName);
            localStorage.setItem('user_email', userEmail);
            localStorage.setItem('user_session_active', 'true');
            
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: userName,
                    email: userEmail
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Registration successful, redirect to chat
                window.location.href = data.redirect || '/';
            } else {
                // Show error
                const errorMsg = data.error || 'Registration failed. Please try again.';
                showError(errorMsg);
            }
        } catch (error) {
            console.error('Registration error:', error);
            showError('Network error. Please check your connection and try again.');
        } finally {
            // Reset button state
            submitButton.disabled = false;
            buttonText.style.display = 'block';
            buttonLoader.style.display = 'none';
        }
    });

    function showError(message) {
        // Create a temporary error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error-toast';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(239, 68, 68, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1000;
            animation: slideDown 0.3s ease-out;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
        `;
        document.head.appendChild(style);

        // Remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
            style.remove();
        }, 5000);
    }

    // Add input animation on focus
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
        });

        input.addEventListener('blur', function() {
            if (!this.value) {
                this.parentElement.classList.remove('focused');
            }
        });
    });
});
