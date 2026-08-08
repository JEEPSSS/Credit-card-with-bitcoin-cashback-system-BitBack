"""End-to-end smoke test across the whole API surface."""
from fastapi.testclient import TestClient
from main import app

c = TestClient(app)

# Fresh test user each run so the suite is idempotent against a persistent DB.
from app.database import SessionLocal as _S
from app.models import User as _U
_db = _S()
_existing = _db.query(_U).filter(_U.email == "t1@x.com").first()
if _existing:
    _db.delete(_existing)
    _db.commit()
_db.close()
ok = fail = 0


def check(label, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS  {label} {extra}")
    else:
        fail += 1
        print(f"  FAIL  {label} {extra}")


print("\nAuth")
r = c.post("/api/auth/register", json={"email": "t1@x.com", "password": "password123",
                                       "display_name": "Test One"})
check("register", r.status_code == 200, r.status_code)
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

check("duplicate email rejected",
      c.post("/api/auth/register", json={"email": "t1@x.com", "password": "password123",
                                         "display_name": "Dup"}).status_code == 400)
check("login", c.post("/api/auth/login", json={"email": "t1@x.com",
                                               "password": "password123"}).status_code == 200)
check("bad password rejected",
      c.post("/api/auth/login", json={"email": "t1@x.com", "password": "wrong"}).status_code == 401)
check("me", c.get("/api/auth/me", headers=H).json()["email"] == "t1@x.com")
check("unauthenticated blocked", c.get("/api/auth/me").status_code == 401)

print("\nCore")
check("categories = 10", len(c.get("/api/categories").json()) == 10)
check("btc price > 0", c.get("/api/btc/price").json()["price"] > 0)

r = c.post("/api/transactions", headers=H,
           json={"amount_fiat": 100.0, "category": "dining", "merchant": "Ramen Keisuke"})
check("create transaction", r.status_code == 200, r.status_code)
body = r.json()
check("sats earned > 0", body["reward"]["total_sats"] > 0, f'({body["reward"]["total_sats"]} sats)')
check("first_swipe badge awarded",
      any(b["key"] == "first_swipe" for b in body["new_badges"]))
check("streak started", body["streak"]["current"] == 1)
check("risk scored", 0 <= body["risk"]["score"] <= 100, f'(score {body["risk"]["score"]})')
check("wallet credited", c.get("/api/wallet", headers=H).json()["balance_sats"] ==
      body["reward"]["total_sats"])
check("invalid category rejected",
      c.post("/api/transactions", headers=H,
             json={"amount_fiat": 10, "category": "nope", "merchant": "x"}).status_code == 400)
check("negative amount rejected",
      c.post("/api/transactions", headers=H,
             json={"amount_fiat": -5, "category": "dining", "merchant": "x"}).status_code == 422)

print("\nBoosts and rewards")
check("boost activates",
      c.post("/api/rewards/boosts/activate", headers=H, json={"category": "dining"}).status_code == 200)
prev = c.post("/api/rewards/preview", headers=H,
              json={"amount_fiat": 100.0, "category": "dining"}).json()
check("boost doubles reward", prev["boost_multiplier"] == 2.0,
      f'(effective {prev["effective_rate"]*100:.1f}%)')
check("rewards summary", c.get("/api/rewards/summary", headers=H).json()["level"]["name"] == "Bronze")
check("boost list", c.get("/api/rewards/boosts", headers=H).json()["active"]["category"] == "dining")

print("\nFeatures")
check("roundup update", c.put("/api/roundup/config", headers=H,
                              json={"is_enabled": True, "multiplier": 2.0}).json()["multiplier"] == 2.0)
r = c.post("/api/transactions", headers=H,
           json={"amount_fiat": 12.35, "category": "groceries", "merchant": "FairPrice"})
check("roundup applied", r.json()["round_up"] is not None,
      f'({r.json()["round_up"]["sats"] if r.json()["round_up"] else 0} sats spare change)')

gid = c.post("/api/goals", headers=H, json={"name": "Cold wallet", "target_sats": 50000}).json()["id"]
check("goal created", gid > 0)
check("over-allocation rejected",
      c.post(f"/api/goals/{gid}/allocate", headers=H, json={"sats": 99_999_999}).status_code == 400)
check("allocation works",
      c.post(f"/api/goals/{gid}/allocate", headers=H, json={"sats": 100}).json()["current_sats"] == 100)
check("goal delete returns sats",
      c.delete(f"/api/goals/{gid}", headers=H).json()["sats_returned"] == 100)

check("alert created", c.post("/api/alerts", headers=H,
                              json={"target_price": 200000, "direction": "above"}).status_code == 200)
check("referral code issued", len(c.get("/api/referral", headers=H).json()["code"]) == 8)
check("leaderboard", c.get("/api/referral/leaderboard").status_code == 200)
check("notifications present", c.get("/api/notifications", headers=H).json()["total"] > 0)
check("auto-withdraw needs address",
      c.put("/api/auto-withdraw/config", headers=H,
            json={"is_enabled": True, "threshold_sats": 50000}).status_code == 400)

print("\n2FA")
setup = c.post("/api/auth/2fa/setup", headers=H).json()
check("2fa setup", len(setup["backup_codes"]) == 8)
import pyotp
code = pyotp.TOTP(setup["secret"]).now()
check("2fa verify", c.post("/api/auth/2fa/verify", headers=H, json={"code": code}).json()["is_enabled"])
login = c.post("/api/auth/login", json={"email": "t1@x.com", "password": "password123"}).json()
check("login now challenges", login["requires_2fa"] is True)
final = c.post("/api/auth/2fa/authenticate",
               json={"challenge_token": login["challenge_token"],
                     "code": pyotp.TOTP(setup["secret"]).now()})
check("2fa completes login", final.status_code == 200 and final.json()["access_token"])
check("wrong 2fa code rejected",
      c.post("/api/auth/2fa/authenticate",
             json={"challenge_token": login["challenge_token"], "code": "000000"}).status_code == 400)

print("\nAI endpoints (demo account)")
d = c.post("/api/auth/login", json={"email": "demo@bitback.app", "password": "demo12345"})
if d.status_code == 200:
    DH = {"Authorization": f"Bearer {d.json()['access_token']}"}
    f = c.get("/api/forecast", headers=DH).json()
    check("forecast has data", f["has_enough_data"],
          f'({f.get("predicted_sats_30d",0):,} sats/30d, conf {f.get("confidence")})')
    check("model comparison present", "model_comparison" in f)
    fr = c.get("/api/fraud/summary", headers=DH).json()
    check("fraud summary", fr["total_transactions_analyzed"] > 100,
          f'(protection {fr["protection_score"]}, {fr["high_risk_count"]} high risk)')
    check("flagged list", len(c.get("/api/fraud/flagged", headers=DH).json()) > 0)
    p = c.get("/api/ai/persona", headers=DH).json()
    check("persona classified", p["has_enough_data"],
          f'({p["persona"]["name"]}, conf {p["confidence"]})')
    b = c.get("/api/ai/boost-recommendation", headers=DH).json()
    check("boost recommendation", b["has_enough_data"],
          f'(top pick: {b["top_pick"]["category"]} @ {b["top_pick"]["score"]})')
    check("analytics spending", len(c.get("/api/analytics/spending", headers=DH).json()["categories"]) > 3)
    check("insights", c.get("/api/analytics/insights", headers=DH).json()["has_data"])
    check("recap", c.get("/api/analytics/recap", headers=DH).json()["has_data"])
    check("wallet growth series",
          len(c.get("/api/wallet/growth?period=30d", headers=DH).json()["points"]) == 31)
    tax = c.get("/api/tax/report?year=2026", headers=DH)
    check("tax CSV", tax.status_code == 200 and "Fair market value" in tax.text)
else:
    print("  (run seed_demo.py first)")

print(f"\n{ok} passed, {fail} failed")
