"""檢查前端送來的 Supabase 登入憑證（JWT），拿到使用者 id。

Supabase 新專案用非對稱金鑰簽章：公開金鑰在 {SUPABASE_URL}/auth/v1/.well-known/jwks.json，
所以後端不需要任何秘密就能驗證。
"""
from functools import lru_cache

AUDIENCE = "authenticated"


class AuthError(Exception):
    pass


@lru_cache(maxsize=4)
def _jwks_client(url: str):
    import jwt
    return jwt.PyJWKClient(url, cache_keys=True)


def bearer_token(header: str | None) -> str:
    if not header or not header.lower().startswith("bearer "):
        raise AuthError("缺少登入憑證（Authorization: Bearer …）")
    return header.split(" ", 1)[1].strip()


def verify(token: str, jwks_url: str, issuer: str | None = None, key=None) -> dict:
    """回傳 JWT 的內容（claims）。key 只給測試用；正式環境從 JWKS 拿公開金鑰。"""
    import jwt
    try:
        signing_key = key if key is not None else _jwks_client(jwks_url).get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, signing_key, algorithms=["ES256", "RS256"], audience=AUDIENCE,
                            issuer=issuer, options={"require": ["exp", "sub"]})
    except Exception as e:  # 過期、簽章不對、格式錯誤…一律當作沒登入
        raise AuthError(f"登入憑證無效：{type(e).__name__}") from e
    return claims
