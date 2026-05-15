from __future__ import annotations

import base64
from io import BytesIO


def make_qr_png(payload: str) -> bytes | None:
    try:
        import qrcode

        image = qrcode.make(payload)
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()
    except Exception:
        return None


def make_fallback_svg(payload: str) -> bytes:
    encoded = base64.b64encode(payload.encode("utf-8")).decode("ascii")[:96]
    cells = "".join(
        f'<rect x="{(idx % 12) * 10}" y="{(idx // 12) * 10}" width="8" height="8" fill="#0f3d2e"/>'
        for idx, char in enumerate(encoded)
        if ord(char) % 3 != 0
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
<rect width="160" height="160" rx="18" fill="#eff8ef"/>
<rect x="20" y="20" width="120" height="120" rx="8" fill="#ffffff"/>
{cells}
<text x="80" y="148" text-anchor="middle" font-size="10" font-family="monospace" fill="#0f3d2e">Carbon Passport</text>
</svg>"""
    return svg.encode("utf-8")

