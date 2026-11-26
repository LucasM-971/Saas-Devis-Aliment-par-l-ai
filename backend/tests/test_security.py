from app.core.security import create_access_token, decode_token, hash_password, verify_password


def test_hash_verify_roundtrip():
    h = hash_password("motdepasse")
    assert h != "motdepasse"
    assert verify_password("motdepasse", h)
    assert not verify_password("mauvais", h)


def test_token_roundtrip():
    token = create_access_token("42")
    assert decode_token(token) == "42"


def test_decode_invalid_token():
    assert decode_token("pas.un.vrai.token") is None


def test_expired_token_is_rejected():
    token = create_access_token("42", expires_minutes=-1)
    assert decode_token(token) is None
