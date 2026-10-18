"""Every icon name the API can send must exist in the app's icon registry.

The app ships only the icons it names in mobile/components/icons.ts, rather
than the whole library, to keep the bundle small. The cost is that a badge,
category or notification added here with a new icon would render as the
fallback glyph. This test is the guard: it collects each name the backend can
emit and checks it against the registry.
"""
import ast
import re
from pathlib import Path

from app.gamification import BADGES
from app.models import Notification, SavingsGoal
from app.reward_engine import LEVELS
from app.spending_persona import PERSONAS
from main import SEED_CATEGORIES

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "mobile" / "components" / "icons.ts"


def _registry() -> set[str]:
    source = REGISTRY.read_text()
    block = source[source.index("const BY_NAME"):]
    block = block[:block.index("};")]
    return set(re.findall(r'^\s*"([a-z0-9-]+)":', block, re.MULTILINE))


def _notify_icons() -> set[str]:
    """The icon argument of every notify(...) call that passes a literal."""
    names = set()
    for path in [*(ROOT / "app").rglob("*.py"), ROOT / "main.py"]:
        for node in ast.walk(ast.parse(path.read_text())):
            if (isinstance(node, ast.Call) and getattr(node.func, "id", None) == "notify"
                    and len(node.args) == 6 and isinstance(node.args[5], ast.Constant)):
                names.add(node.args[5].value)
    return names


def test_the_registry_parses():
    assert len(_registry()) > 20


def test_notify_calls_are_found():
    # If notify's signature changes this collects nothing and the test below
    # would pass vacuously.
    assert {"bell", "gift", "shield-alert", "trending-up"} <= _notify_icons()


def test_every_icon_the_backend_can_send_is_in_the_app():
    sent = (
        {b["icon"] for b in BADGES}
        | {lvl["icon"] for lvl in LEVELS}
        | {p["icon"] for p in PERSONAS}
        | {icon for _, _, icon, _ in SEED_CATEGORIES}
        | {SavingsGoal.__table__.c.icon.default.arg, Notification.__table__.c.icon.default.arg}
        | {"shield", "plane"}            # goal icons in seed_demo.py
        | _notify_icons()
    )
    missing = sent - _registry()
    assert not missing, f"add these to BY_NAME in {REGISTRY.relative_to(ROOT)}: {sorted(missing)}"
