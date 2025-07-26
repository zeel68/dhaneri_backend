import requests
import uuid

BASE_URL = "http://localhost:5050"
RESET_PASSWORD_ENDPOINT = "/api/auth/reset-password"
FORGOT_PASSWORD_ENDPOINT = "/api/auth/forgot-password"
REGISTER_ENDPOINT = "/api/auth/register"
VERIFY_EMAIL_ENDPOINT = "/api/auth/verify-email"
LOGIN_ENDPOINT = "/api/auth/login"
DELETE_USER_ENDPOINT = "/api/store-admin/customers/{customerId}"  # Not used here but placeholder if needed

TIMEOUT = 30

# Placeholder token for Bearer auth; in real scenario, replace with valid token
BEARER_TOKEN = "your_valid_bearer_token_here"

headers = {
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "Content-Type": "application/json"
}

def test_reset_password():
    # Step 1: Register a new user to test reset password flow
    unique_suffix = uuid.uuid4().hex[:8]
    test_email = f"testuser_{unique_suffix}@example.com"
    test_password = "InitialPass123!"
    store_id = "test_store_id"  # Assuming a dummy store_id; adjust if needed
    test_phone_number = f"123456{unique_suffix}"
    register_payload = {
        "name": "Test User",
        "email": test_email,
        "phone_number": test_phone_number,
        "password": test_password,
        "store_id": store_id
    }

    # Register user
    try:
        reg_resp = requests.post(
            BASE_URL + REGISTER_ENDPOINT,
            json=register_payload,
            timeout=TIMEOUT
        )
        assert reg_resp.status_code == 201 or reg_resp.status_code == 200, f"User registration failed: {reg_resp.text}"

        # Step 2: Simulate forgot password to get OTP (assuming OTP is sent via email, here we simulate by requesting)
        forgot_payload = {"email": test_email}
        forgot_resp = requests.post(
            BASE_URL + FORGOT_PASSWORD_ENDPOINT,
            json=forgot_payload,
            timeout=TIMEOUT
        )
        assert forgot_resp.status_code == 200, f"Forgot password request failed: {forgot_resp.text}"

        # For testing, we need OTP. Since no direct API to get OTP, assume OTP is "123456" for test or fetched from response
        # If OTP is returned in response (not specified), extract it; else use dummy OTP for test
        otp = None
        try:
            otp = forgot_resp.json().get("otp")
        except Exception:
            otp = None
        if not otp:
            otp = "123456"  # fallback dummy OTP for testing

        # Step 3: Reset password with valid email, OTP, and new password
        new_password = "NewPass123!"
        reset_payload = {
            "email": test_email,
            "otp": otp,
            "newPassword": new_password
        }
        # Remove Authorization header for reset password request as per PRD (no JWT required)
        reset_resp = requests.post(
            BASE_URL + RESET_PASSWORD_ENDPOINT,
            json=reset_payload,
            headers={"Content-Type": "application/json"},
            timeout=TIMEOUT
        )
        assert reset_resp.status_code == 200, f"Reset password failed with valid data: {reset_resp.text}"

        # Step 4: Verify password was updated by logging in with new password
        login_payload = {
            "email": test_email,
            "password": new_password
        }
        login_resp = requests.post(
            BASE_URL + LOGIN_ENDPOINT,
            json=login_payload,
            timeout=TIMEOUT
        )
        assert login_resp.status_code == 200, f"Login with new password failed: {login_resp.text}"
        login_json = login_resp.json()
        assert "token" in login_json or "accessToken" in login_json, "Login response missing token"

        # Step 5: Test reset password with invalid inputs and expect errors

        # Invalid email format
        invalid_email_payload = {
            "email": "invalid-email-format",
            "otp": otp,
            "newPassword": new_password
        }
        invalid_email_resp = requests.post(
            BASE_URL + RESET_PASSWORD_ENDPOINT,
            json=invalid_email_payload,
            headers={"Content-Type": "application/json"},
            timeout=TIMEOUT
        )
        assert invalid_email_resp.status_code >= 400, "Reset password accepted invalid email format"

        # Missing OTP
        missing_otp_payload = {
            "email": test_email,
            "newPassword": new_password
        }
        missing_otp_resp = requests.post(
            BASE_URL + RESET_PASSWORD_ENDPOINT,
            json=missing_otp_payload,
            headers={"Content-Type": "application/json"},
            timeout=TIMEOUT
        )
        assert missing_otp_resp.status_code >= 400, "Reset password accepted missing OTP"

        # Invalid OTP
        invalid_otp_payload = {
            "email": test_email,
            "otp": "000000",
            "newPassword": new_password
        }
        invalid_otp_resp = requests.post(
            BASE_URL + RESET_PASSWORD_ENDPOINT,
            json=invalid_otp_payload,
            headers={"Content-Type": "application/json"},
            timeout=TIMEOUT
        )
        assert invalid_otp_resp.status_code >= 400, "Reset password accepted invalid OTP"

        # Missing newPassword
        missing_password_payload = {
            "email": test_email,
            "otp": otp
        }
        missing_password_resp = requests.post(
            BASE_URL + RESET_PASSWORD_ENDPOINT,
            json=missing_password_payload,
            headers={"Content-Type": "application/json"},
            timeout=TIMEOUT
        )
        assert missing_password_resp.status_code >= 400, "Reset password accepted missing newPassword"

    finally:
        # Cleanup: If there was a user deletion endpoint and we had userId, we could delete the user here.
        # Since no userId or delete user API is specified for this test, skipping cleanup.
        pass

test_reset_password()
