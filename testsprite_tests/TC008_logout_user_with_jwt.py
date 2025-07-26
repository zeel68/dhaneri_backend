import requests
import uuid

BASE_URL = "http://localhost:5050"
REGISTER_URL = f"{BASE_URL}/api/auth/register"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
LOGOUT_URL = f"{BASE_URL}/api/auth/logout"
ME_URL = f"{BASE_URL}/api/auth/me"

TIMEOUT = 30


def test_logout_user_with_jwt():
    # Generate unique user data for registration
    unique_id = str(uuid.uuid4())
    user_data = {
        "name": "Test User",
        "email": f"testuser_{unique_id}@example.com",
        "password": "TestPass123!",
        "store_id": "test_store_001"
    }

    headers = {"Content-Type": "application/json"}

    # Register user
    try:
        reg_resp = requests.post(REGISTER_URL, json=user_data, headers=headers, timeout=TIMEOUT)
        assert reg_resp.status_code == 201 or reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"

        # Login user to get JWT token
        login_payload = {
            "email": user_data["email"],
            "password": user_data["password"]
        }
        login_resp = requests.post(LOGIN_URL, json=login_payload, headers=headers, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_json = login_resp.json()
        token = login_json.get("token") or login_json.get("accessToken") or login_json.get("jwt")
        assert token, "JWT token not found in login response"

        auth_headers = {
            "Authorization": f"Bearer {token}"
        }

        # Access a protected endpoint to verify token is valid before logout
        me_resp = requests.get(ME_URL, headers=auth_headers, timeout=TIMEOUT)
        assert me_resp.status_code == 200, f"Accessing protected endpoint failed before logout: {me_resp.text}"

        # Logout user
        logout_resp = requests.post(LOGOUT_URL, headers=auth_headers, timeout=TIMEOUT)
        assert logout_resp.status_code == 200 or logout_resp.status_code == 204, f"Logout failed: {logout_resp.text}"

        # Access protected endpoint after logout should fail (token invalidated)
        me_resp_after_logout = requests.get(ME_URL, headers=auth_headers, timeout=TIMEOUT)
        assert me_resp_after_logout.status_code == 401 or me_resp_after_logout.status_code == 403, \
            f"Token still valid after logout: {me_resp_after_logout.text}"

    finally:
        # Cleanup: delete the created user if API supports it (not specified in PRD)
        # Since no delete user endpoint is specified, no cleanup is done here.
        pass


test_logout_user_with_jwt()
