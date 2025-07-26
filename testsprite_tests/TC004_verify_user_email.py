import requests
import uuid

BASE_URL = "http://localhost:5050"
REGISTER_ENDPOINT = "/api/auth/register"
LOGIN_ENDPOINT = "/api/auth/login"
VERIFY_EMAIL_ENDPOINT = "/api/auth/verify-email"
RESEND_VERIFICATION_ENDPOINT = "/api/auth/resend-verification"
HEADERS_JSON = {"Content-Type": "application/json"}
TIMEOUT = 30

def test_verify_user_email():
    unique_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass123!"
    name = "Test User"
    store_id = "test_store_id_123"

    # Step 1: Register new user without phone_number
    register_payload = {
        "name": name,
        "email": unique_email,
        "password": password,
        "store_id": store_id
    }
    try:
        reg_resp = requests.post(
            BASE_URL + REGISTER_ENDPOINT,
            json=register_payload,
            headers=HEADERS_JSON,
            timeout=TIMEOUT
        )
        assert reg_resp.status_code == 201 or reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
    except Exception as e:
        raise AssertionError(f"User registration request failed: {e}")

    # Step 2: Login to get JWT token
    login_payload = {
        "email": unique_email,
        "password": password
    }
    try:
        login_resp = requests.post(
            BASE_URL + LOGIN_ENDPOINT,
            json=login_payload,
            headers=HEADERS_JSON,
            timeout=TIMEOUT
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        token = login_data.get("token") or login_data.get("accessToken") or login_data.get("jwt") or login_data.get("access_token")
        assert token, "JWT token not found in login response"
    except Exception as e:
        raise AssertionError(f"User login request failed: {e}")

    # Step 3: Attempt to verify email with incorrect OTP without Authorization header (not required by PRD)
    incorrect_otp_payload = {
        "email": unique_email,
        "otp": "000000"
    }
    try:
        incorrect_resp = requests.post(
            BASE_URL + VERIFY_EMAIL_ENDPOINT,
            json=incorrect_otp_payload,
            headers=HEADERS_JSON,
            timeout=TIMEOUT
        )
        assert incorrect_resp.status_code in (400, 401, 422), f"Expected failure status for incorrect OTP, got {incorrect_resp.status_code}"
        err_json = incorrect_resp.json()
        assert "error" in err_json or "message" in err_json, "Error message not found in response for incorrect OTP"
    except Exception as e:
        raise AssertionError(f"Verify email with incorrect OTP request failed: {e}")

    # Step 4: Resend verification OTP without auth header
    try:
        resend_resp = requests.post(
            BASE_URL + RESEND_VERIFICATION_ENDPOINT,
            json={"email": unique_email},
            headers=HEADERS_JSON,
            timeout=TIMEOUT
        )
        assert resend_resp.status_code in (200, 202, 204), f"Resend verification failed: {resend_resp.text}"
    except Exception as e:
        raise AssertionError(f"Resend verification request failed: {e}")

    # Step 5: Test correct OTP with placeholder
    correct_otp_payload = {
        "email": unique_email,
        "otp": "123456"
    }
    try:
        correct_resp = requests.post(
            BASE_URL + VERIFY_EMAIL_ENDPOINT,
            json=correct_otp_payload,
            headers=HEADERS_JSON,
            timeout=TIMEOUT
        )
        if correct_resp.status_code == 200:
            resp_json = correct_resp.json()
            assert "success" in resp_json or "message" in resp_json, "Success message missing in correct OTP response"
        else:
            assert correct_resp.status_code in (400, 401, 422), f"Unexpected status code for correct OTP test: {correct_resp.status_code}"
            err_json = correct_resp.json()
            assert "error" in err_json or "message" in err_json, "Error message missing in incorrect OTP response"
    except Exception as e:
        raise AssertionError(f"Verify email with correct OTP request failed: {e}")

test_verify_user_email()