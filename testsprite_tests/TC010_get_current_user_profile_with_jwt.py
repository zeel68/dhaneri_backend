import requests
import uuid

BASE_URL = "http://localhost:5050"
REGISTER_URL = f"{BASE_URL}/api/auth/register"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ME_URL = f"{BASE_URL}/api/auth/me"
LOGOUT_URL = f"{BASE_URL}/api/auth/logout"

TIMEOUT = 30

def test_get_current_user_profile_with_jwt():
    # Generate unique user data for registration
    unique_suffix = str(uuid.uuid4())
    user_data = {
        "name": "Test User",
        "email": f"testuser_{unique_suffix}@example.com",
        "phone_number": "1234567890",
        "password": "TestPass123!",
        "store_id": "store123"
    }

    headers = {"Content-Type": "application/json"}

    # Register user
    register_resp = requests.post(REGISTER_URL, json=user_data, headers=headers, timeout=TIMEOUT)
    assert register_resp.status_code == 201 or register_resp.status_code == 200, f"User registration failed: {register_resp.text}"

    try:
        # Login user to get JWT token
        login_payload = {
            "email": user_data["email"],
            "password": user_data["password"]
        }
        login_resp = requests.post(LOGIN_URL, json=login_payload, headers=headers, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_json = login_resp.json()
        assert "token" in login_json or "accessToken" in login_json, "JWT token not found in login response"
        token = login_json.get("token") or login_json.get("accessToken")
        auth_headers = {
            "Authorization": f"Bearer {token}"
        }

        # Access /api/auth/me with valid JWT
        me_resp = requests.get(ME_URL, headers=auth_headers, timeout=TIMEOUT)
        assert me_resp.status_code == 200, f"Failed to get user profile with valid JWT: {me_resp.text}"
        me_json = me_resp.json()
        # Validate returned user info matches registered user (at least email and name)
        assert me_json.get("email") == user_data["email"], "Returned email does not match registered email"
        assert me_json.get("name") == user_data["name"], "Returned name does not match registered name"

        # Access /api/auth/me without JWT (no Authorization header)
        no_auth_resp = requests.get(ME_URL, timeout=TIMEOUT)
        assert no_auth_resp.status_code == 401 or no_auth_resp.status_code == 403, "Access without JWT should be denied"

        # Access /api/auth/me with invalid JWT
        invalid_auth_headers = {
            "Authorization": "Bearer invalidtoken123"
        }
        invalid_auth_resp = requests.get(ME_URL, headers=invalid_auth_headers, timeout=TIMEOUT)
        assert invalid_auth_resp.status_code == 401 or invalid_auth_resp.status_code == 403, "Access with invalid JWT should be denied"

    finally:
        # Logout user to invalidate token (best effort)
        try:
            if 'token' in locals():
                logout_resp = requests.post(LOGOUT_URL, headers=auth_headers, timeout=TIMEOUT)
                # Logout might return 200 or 204 or 401 if token already invalid
                assert logout_resp.status_code in [200, 204, 401], f"Unexpected logout response: {logout_resp.status_code}"
        except Exception:
            pass

test_get_current_user_profile_with_jwt()
