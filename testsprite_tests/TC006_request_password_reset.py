import requests

BASE_URL = "http://localhost:5050"
FORGOT_PASSWORD_ENDPOINT = "/api/auth/forgot-password"


def test_request_password_reset():
    url = BASE_URL + FORGOT_PASSWORD_ENDPOINT
    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "email": "testuser@example.com"
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Unexpected status code: {response.status_code}"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert "message" in data or "success" in data, "Response JSON missing expected keys"
    if "success" in data:
        assert data["success"] is True, "Password reset success flag is not True"
    if "message" in data:
        assert isinstance(data["message"], str) and len(data["message"]) > 0, "Message is empty or not a string"


test_request_password_reset()
