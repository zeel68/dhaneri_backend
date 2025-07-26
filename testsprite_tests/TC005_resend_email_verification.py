import requests
import uuid

BASE_URL = "http://localhost:5050"
REGISTER_ENDPOINT = f"{BASE_URL}/api/auth/register"
LOGIN_ENDPOINT = f"{BASE_URL}/api/auth/login"
RESEND_VERIFICATION_ENDPOINT = f"{BASE_URL}/api/auth/resend-verification"

TIMEOUT = 30

def test_resend_email_verification():
    # Generate unique user data
    unique_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    user_password = "TestPass123!"
    user_name = "Test User"
    user_store_id = "store123"  # Assuming a dummy store_id; adjust if needed
    user_phone_number = "1234567890"  # Added phone_number as string

    headers = {"Content-Type": "application/json"}

    # Register user
    register_payload = {
        "name": user_name,
        "email": unique_email,
        "phone_number": user_phone_number,
        "password": user_password,
        "store_id": user_store_id
    }
    reg_resp = requests.post(REGISTER_ENDPOINT, json=register_payload, headers=headers, timeout=TIMEOUT)
    assert reg_resp.status_code in [201, 200, 409], f"User registration failed: {reg_resp.text}"

    # Login user to get JWT token
    login_payload = {
        "email": unique_email,
        "password": user_password
    }
    login_resp = requests.post(LOGIN_ENDPOINT, json=login_payload, headers=headers, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    login_data = login_resp.json()
    assert "token" in login_data or "accessToken" in login_data, "JWT token not found in login response"
    token = login_data.get("token") or login_data.get("accessToken")

    # Resend verification does not require auth, so do not send Authorization header
    resend_payload = {"email": unique_email}
    resend_resp = requests.post(RESEND_VERIFICATION_ENDPOINT, json=resend_payload, headers=headers, timeout=TIMEOUT)
    assert resend_resp.status_code == 200, f"Resend verification failed for unverified user: {resend_resp.text}"
    resend_data = resend_resp.json()
    assert "message" in resend_data, "No message in resend verification response"

    # 2) Resend verification again expecting 200 or error with message
    resend_resp2 = requests.post(RESEND_VERIFICATION_ENDPOINT, json=resend_payload, headers=headers, timeout=TIMEOUT)
    assert resend_resp2.status_code in [200, 400, 409], f"Unexpected status code on resend for verified user: {resend_resp2.status_code}"
    resend_data2 = resend_resp2.json()
    assert "message" in resend_data2, "No message in resend verification response for verified user"

    # 3) Resend verification with invalid email (should fail)
    invalid_email_payload = {"email": "invalid-email-format"}
    resend_invalid_resp = requests.post(RESEND_VERIFICATION_ENDPOINT, json=invalid_email_payload, headers=headers, timeout=TIMEOUT)
    assert resend_invalid_resp.status_code in [400, 422], f"Invalid email resend did not fail as expected: {resend_invalid_resp.status_code}"
    invalid_resp_data = resend_invalid_resp.json()
    assert "error" in invalid_resp_data or "message" in invalid_resp_data, "No error message for invalid email resend"


test_resend_email_verification()
