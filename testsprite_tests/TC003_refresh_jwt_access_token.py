import requests

BASE_URL = "http://localhost:5050"
TIMEOUT = 30

def test_refresh_jwt_access_token():
    # First, login to get valid access and refresh tokens
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {
        "email": "testuser@example.com",
        "password": "TestPassword123!"
    }
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        assert "accessToken" in login_data and "refreshToken" in login_data, "Tokens missing in login response"
        valid_refresh_token = login_data["refreshToken"]
    except Exception as e:
        raise AssertionError(f"Login step failed: {e}")

    refresh_url = f"{BASE_URL}/api/auth/refresh-token"
    headers = {"Authorization": f"Bearer {valid_refresh_token}"}

    # Test with valid refresh token
    try:
        refresh_resp = requests.post(refresh_url, headers=headers, timeout=TIMEOUT)
        assert refresh_resp.status_code == 200, f"Refresh token request failed: {refresh_resp.text}"
        refresh_data = refresh_resp.json()
        assert "accessToken" in refresh_data, "New access token not returned"
        new_access_token = refresh_data["accessToken"]
        assert isinstance(new_access_token, str) and len(new_access_token) > 0, "Invalid new access token"
    except Exception as e:
        raise AssertionError(f"Valid refresh token test failed: {e}")

    # Test with invalid refresh token
    invalid_headers = {"Authorization": "Bearer invalid_or_expired_token"}
    try:
        invalid_resp = requests.post(refresh_url, headers=invalid_headers, timeout=TIMEOUT)
        assert invalid_resp.status_code in (401, 403), f"Invalid token should be rejected, got {invalid_resp.status_code}"
        error_data = invalid_resp.json()
        assert "error" in error_data or "message" in error_data, "Error message missing for invalid token"
    except Exception as e:
        raise AssertionError(f"Invalid refresh token test failed: {e}")

test_refresh_jwt_access_token()