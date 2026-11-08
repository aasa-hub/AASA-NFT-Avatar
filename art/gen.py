#!/usr/bin/env python3
"""Authorized Avatars — deterministic generative art engine.
Produces animated GIFs + ERC-721 metadata, seeded per tokenId.
Palette derived from the $AASA logo: near-black base, deep green #163E12, mint highlight.
"""
import json, os, hashlib, io
from PIL import Image, ImageDraw, ImageFilter

W = 64          # logical pixel canvas
OUT = 256       # rendered size
FRAMES = 4

# ---------------------------------------------------------------- palette
INK      = (8, 10, 8)
DEEP     = (22, 62, 18)     # logo green
MID      = (46, 122, 38)
MINT     = (124, 255, 77)
GOLD     = (240, 200, 90)
WHITE    = (240, 245, 238)
GREY     = (150, 158, 148)

SKINS = [
    ("Porcelain",  (242, 220, 200)),
    ("Fair",       (232, 198, 170)),
    ("Tan",        (204, 154, 112)),
    ("Brown",      (158, 108, 70)),
    ("Dark Brown", (110, 72, 46)),
    ("Deep",       (72, 46, 32)),
]
SHIRTS = [
    ("Jet",     (30, 32, 30)),
    ("Moss",    (36, 78, 32)),
    ("Mint",    (124, 255, 77)),
    ("Bone",    (226, 228, 218)),
    ("Rust",    (170, 78, 40)),
    ("Cobalt",  (40, 76, 150)),
    ("Violet",  (110, 62, 158)),
    ("Gold",    (198, 158, 60)),
]
DESIGNS = ["Plain", "Stripe", "Collar", "Hoodie", "Jersey", "Grid"]
GLASSES = ["None", "Round", "Square", "Visor", "Shades"]
EARRINGS = ["None", "Studs", "Hoops", "Danglers"]
HEADWEAR = ["None", "Cap", "Beanie", "Crown", "Headset", "Band"]

TIERS = [
    # name,     bg,        sparkle count, accent
    ("Static",     (14, 16, 14), 6,  GREY),
    ("Ember",      (22, 20, 14), 12, GOLD),
    ("Aurora",     (14, 30, 22), 20, MINT),
    ("Nebula",     (26, 14, 34), 30, (168, 120, 255)),
    ("Singularity",(30, 26, 8),  44, GOLD),
]

# ---------------------------------------------------------------- helpers
def rng(seed):
    h = hashlib.sha256(str(seed).encode()).digest()
    i = 0
    while True:
        yield h[i % len(h)] / 255.0
        i += 1

def pick(gen, seq):
    r = next(gen)
    return seq[min(int(r * len(seq)), len(seq) - 1)]

def tier_of(token_id):
    return min((token_id - 1) // 200, 4)

def size(t): return OUT

# ---------------------------------------------------------------- drawing
def base_avatar(skin, blink=False):
    """64x64 bust with pixel shading."""
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    sk = skin
    dark = tuple(max(0, c - 38) for c in sk)
    lite = tuple(min(255, c + 26) for c in sk)
    # neck + shoulders
    d.rectangle([26, 40, 37, 48], fill=dark)
    d.rounded_rectangle([12, 46, 51, 64], 6, fill=(24, 26, 24, 255))
    # head
    d.rounded_rectangle([20, 12, 43, 41], 8, fill=sk)
    d.rounded_rectangle([21, 13, 42, 22], 7, fill=lite)   # forehead light
    # ears
    d.rectangle([18, 26, 20, 32], fill=dark)
    d.rectangle([43, 26, 45, 32], fill=dark)
    # eyes
    if blink:
        d.rectangle([25, 26, 29, 27], fill=(20, 16, 14))
        d.rectangle([34, 26, 38, 27], fill=(20, 16, 14))
    else:
        d.rectangle([25, 25, 29, 29], fill=WHITE)
        d.rectangle([34, 25, 38, 29], fill=WHITE)
        d.rectangle([27, 26, 28, 28], fill=(18, 14, 12))
        d.rectangle([36, 26, 37, 28], fill=(18, 14, 12))
    # brows + mouth
    d.rectangle([24, 22, 29, 23], fill=dark)
    d.rectangle([34, 22, 39, 23], fill=dark)
    d.rectangle([30, 33, 34, 34], fill=(96, 44, 40))
    return im

def shirt_layer(color, design):
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    dark = tuple(max(0, c - 30) for c in color)
    lite = tuple(min(255, c + 30) for c in color)
    d.rounded_rectangle([10, 48, 53, 64], 6, fill=color)
    if design == "Stripe":
        for y in (52, 56, 60):
            d.rectangle([11, y, 52, y + 1], fill=lite)
    elif design == "Collar":
        d.polygon([(26, 48), (32, 55), (38, 48)], fill=dark)
    elif design == "Hoodie":
        d.rounded_rectangle([8, 44, 55, 52], 5, fill=dark)
        d.line([(28, 52), (28, 60)], fill=lite)
        d.line([(35, 52), (35, 60)], fill=lite)
    elif design == "Jersey":
        d.rectangle([30, 48, 33, 64], fill=lite)
        d.rectangle([11, 48, 14, 64], fill=lite)
    elif design == "Grid":
        for x in range(14, 52, 6):
            for y in range(50, 64, 6):
                d.rectangle([x, y, x + 1, y + 1], fill=lite)
    return im

def glasses_layer(style):
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if style == "None":
        return im
    if style == "Round":
        d.ellipse([23, 23, 31, 31], outline=GOLD, width=1)
        d.ellipse([33, 23, 41, 31], outline=GOLD, width=1)
        d.line([(31, 27), (33, 27)], fill=GOLD)
    elif style == "Square":
        d.rectangle([23, 23, 31, 30], outline=WHITE, width=1)
        d.rectangle([33, 23, 41, 30], outline=WHITE, width=1)
        d.line([(31, 26), (33, 26)], fill=WHITE)
    elif style == "Visor":
        d.rectangle([21, 23, 43, 28], fill=(20, 40, 90, 210))
        d.rectangle([21, 23, 43, 24], fill=MINT)
    elif style == "Shades":
        d.rectangle([23, 23, 31, 29], fill=INK)
        d.rectangle([33, 23, 41, 29], fill=INK)
        d.line([(25, 24), (27, 24)], fill=(90, 90, 90))
        d.line([(35, 24), (37, 24)], fill=(90, 90, 90))
    return im

def earrings_layer(style):
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if style == "Studs":
        d.rectangle([17, 33, 18, 34], fill=GOLD)
        d.rectangle([45, 33, 46, 34], fill=GOLD)
    elif style == "Hoops":
        d.ellipse([16, 32, 20, 37], outline=GOLD, width=1)
        d.ellipse([43, 32, 47, 37], outline=GOLD, width=1)
    elif style == "Danglers":
        d.line([(18, 33), (18, 38)], fill=GOLD)
        d.line([(45, 33), (45, 38)], fill=GOLD)
        d.rectangle([17, 38, 19, 39], fill=MINT)
        d.rectangle([44, 38, 46, 39], fill=MINT)
    return im

def hat_layer(style):
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if style == "Cap":
        d.rounded_rectangle([19, 6, 44, 15], 4, fill=MID)
        d.rectangle([43, 12, 50, 14], fill=MID)
    elif style == "Beanie":
        d.rounded_rectangle([19, 4, 44, 15], 5, fill=(60, 40, 30))
        d.rectangle([19, 13, 44, 16], fill=(90, 62, 44))
    elif style == "Crown":
        d.polygon([(22, 14), (24, 5), (28, 11), (32, 3), (36, 11), (40, 5), (42, 14)], fill=GOLD)
        d.rectangle([22, 13, 42, 16], fill=GOLD)
    elif style == "Headset":
        d.arc([18, 4, 45, 28], 180, 360, fill=INK, width=2)
        d.rectangle([16, 22, 19, 32], fill=INK)
        d.rectangle([44, 22, 47, 32], fill=INK)
    elif style == "Band":
        d.rectangle([19, 11, 44, 14], fill=MINT)
    return im

def background(tier, frame):
    """Tier-dependent animated background with sparkles."""
    name, bg, count, accent = TIERS[tier]
    im = Image.new("RGBA", (W, W), bg + (255,))
    d = ImageDraw.Draw(im)
    # radial vignette glow
    glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([10, 4, 54, 52], fill=accent + (26,))
    glow = glow.filter(ImageFilter.GaussianBlur(6))
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)
    # tier-specific structures
    if tier == 2:      # aurora streaks
        for y in (12, 30, 48):
            off = (frame * 3) % 12
            d.line([(0, y + off % 4), (W, y - off % 4)], fill=accent + (60,), width=1)
    if tier == 3:      # nebula rings
        r = 14 + frame * 2
        d.ellipse([32 - r, 32 - r, 32 + r, 32 + r], outline=accent + (55,), width=1)
    if tier == 4:      # singularity rings
        for k, r in enumerate((10, 18, 26)):
            rr = r + ((frame + k) % 3)
            d.ellipse([32 - rr, 32 - rr, 32 + rr, 32 + rr], outline=accent + (70,), width=1)
    # sparkles: deterministic positions, twinkle by frame
    g = rng(f"{tier}-spark")
    for i in range(count):
        x = int(next(g) * (W - 1)); y = int(next(g) * (W - 1))
        phase = (i + frame) % 4
        if phase == 0:
            d.point((x, y), fill=WHITE)
        elif phase == 1:
            d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=WHITE)
        elif phase == 2:
            d.line([(x - 2, y), (x + 2, y)], fill=accent)
            d.line([(x, y - 2), (x, y + 2)], fill=accent)
        else:
            d.rectangle([x - 1, y, x + 1, y], fill=accent)
    return im

def tier_badge(tier, accent):
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # hex frame corners
    c = accent
    for (x, y, dx, dy) in [(2, 2, 1, 1), (W - 3, 2, -1, 1), (2, W - 3, 1, -1), (W - 3, W - 3, -1, -1)]:
        d.line([(x, y), (x + dx * 10, y)], fill=c, width=1)
        d.line([(x, y), (x, y + dy * 10)], fill=c, width=1)
    d.rectangle([1, W - 9, 8, W - 2], fill=INK)
    d.text((2, W - 9), f"T{tier + 1}", fill=accent)
    return im

_LOGO = None
def logo():
    global _LOGO
    if _LOGO is None:
        p = os.path.join(os.path.dirname(__file__), "logo.png")
        if os.path.exists(p):
            lg = Image.open(p).convert("RGB").resize((14, 14), Image.LANCZOS)
            # tint logo mark to mint on transparent bg using luminance mask
            g = lg.convert("L")
            mask = g.point(lambda v: 255 if v > 60 else 0)
            tint = Image.new("RGBA", (14, 14), MINT + (255,))
            tint.putalpha(mask)
            _LOGO = tint
        else:
            _LOGO = Image.new("RGBA", (14, 14), (0, 0, 0, 0))
    return _LOGO

# ---------------------------------------------------------------- compose
def traits_for(token_id, salt=0):
    g = rng("aa-" + str(token_id) + ("" if salt == 0 else f"-{salt}"))
    t = tier_of(token_id)
    skin = pick(g, SKINS)
    shirt = pick(g, SHIRTS)
    design = pick(g, DESIGNS)
    gl = pick(g, GLASSES)
    er = pick(g, EARRINGS)
    hw = pick(g, HEADWEAR)
    return t, skin, shirt, design, gl, er, hw

def frames_for(token_id, salt=0):
    t, skin, shirt, design, gl, er, hw = traits_for(token_id, salt)
    out = []
    for f in range(FRAMES):
        im = background(t, f)
        im = Image.alpha_composite(im, base_avatar(skin[1], blink=(f == 2)))
        im = Image.alpha_composite(im, shirt_layer(shirt[1], design))
        im = Image.alpha_composite(im, earrings_layer(er))
        im = Image.alpha_composite(im, glasses_layer(gl))
        im = Image.alpha_composite(im, hat_layer(hw))
        im = Image.alpha_composite(im, tier_badge(t, TIERS[t][3]))
        im.alpha_composite(logo(), (W - 16, W - 16))
        out.append(im.resize((OUT, OUT), Image.NEAREST).convert("P", palette=Image.ADAPTIVE, colors=64))
    return out, (t, skin, shirt, design, gl, er, hw)

def save_gif(token_id, path, salt=0):
    fr, tr = frames_for(token_id, salt)
    fr[0].save(path, save_all=True, append_images=fr[1:], duration=[180, 180, 420, 180],
               loop=0, disposal=2, optimize=True)
    return tr

def metadata(token_id, base, salt=0):
    t, skin, shirt, design, gl, er, hw = traits_for(token_id, salt)
    tier_name = TIERS[t][0]
    redeem = [115000, 276000, 667000, 1611000, 3866000][t]
    return {
        "name": f"Authorized Avatar #{token_id}",
        "description": (
            f"Authorized Avatar #{token_id} — {tier_name} tier on Base. "
            f"Animated on-chain identity card. Redeemable once for {redeem:,} $AASA. "
            f"Never burned: yours to hold, sell, or stake."
        ),
        "image": f"{base}img/{token_id}.gif",
        "animation_url": f"{base}img/{token_id}.gif",
        "external_url": "https://authorized-avatars.vercel.app",
        "attributes": [
            {"trait_type": "Tier", "value": tier_name},
            {"trait_type": "Background", "value": f"{tier_name} Field"},
            {"trait_type": "Skin", "value": skin[0]},
            {"trait_type": "Shirt", "value": shirt[0]},
            {"trait_type": "Shirt Pattern", "value": design},
            {"trait_type": "Glasses", "value": gl},
            {"trait_type": "Earrings", "value": er},
            {"trait_type": "Headwear", "value": hw},
            {"trait_type": "Redeemable AASA", "value": redeem, "display_type": "number"},
        ],
    }

if __name__ == "__main__":
    import sys, time
    ids = [int(a) for a in sys.argv[1:]] or [1, 87, 210, 420, 640, 860, 999, 1000]
    os.makedirs("preview", exist_ok=True)
    t0 = time.time()
    for i in ids:
        tr = save_gif(i, f"preview/{i}.gif")
        print(i, "tier", tr[0] + 1, tr[1][0], tr[2][0], tr[3], tr[4], tr[5], tr[6])
    print(f"{len(ids)} rendered in {time.time() - t0:.1f}s  ({(time.time()-t0)/len(ids):.3f}s each)")
