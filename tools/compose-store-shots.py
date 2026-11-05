"""Compose 1280x800 Chrome Web Store screenshots from the real captures."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 800
BG_TOP = (11, 18, 32)
BG_BOTTOM = (17, 24, 39)
ACCENT = (34, 197, 94)
TEXT = (249, 250, 251)
MUTED = (148, 163, 184)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def font(size, bold=False):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def background():
    img = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line(
            [(0, y), (W, y)],
            fill=(
                int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
                int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
                int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
            ),
        )
    # soft accent glow, bottom-left
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-260, H - 260, 420, H + 260], fill=(*ACCENT, 26))
    return Image.alpha_composite(img.convert("RGBA"), glow)


def shadowed(card, radius=18, pad=26):
    w, h = card.size
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    shade = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle(
        [pad - 6, pad + 2, pad + w + 6, pad + h + 12], radius=radius, fill=(0, 0, 0, 120)
    )
    shade = shade.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(14))
    canvas = Image.alpha_composite(canvas, shade)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    card = card.convert("RGBA")
    card.putalpha(mask)
    canvas.paste(card, (pad, pad), card)
    return canvas


def header(img, title, subtitle):
    d = ImageDraw.Draw(img)
    d.text((72, 58), title, font=font(52, True), fill=TEXT)
    d.text((72, 126), subtitle, font=font(26), fill=MUTED)
    d.rounded_rectangle([72, 176, 72 + 64, 176 + 6], radius=3, fill=ACCENT)


# ── Shot 1: the popup ────────────────────────────────────────────────────
shot1 = background()
header(shot1, "PastePic", "Cole uma imagem no editor: upload e tag no cursor")
popup = Image.open("store/raw/popup.png")
target_w = 360
popup = popup.resize((target_w, int(popup.height * target_w / popup.width)), Image.LANCZOS)
card = shadowed(popup, pad=18)
shot1.paste(card, (96, 236), card)

d = ImageDraw.Draw(shot1)
x = 96 + card.width + 56
lines = [
    ("1", "Copie um print", "Cmd+Shift+Ctrl+4"),
    ("2", "Cole no editor", "Cmd+V / Ctrl+V"),
    ("3", "Pronto", "a tag entra no cursor"),
]
y = 300
for num, title, sub in lines:
    d.ellipse([x, y, x + 44, y + 44], fill=ACCENT)
    nf = font(24, True)
    tw = d.textlength(num, font=nf)
    d.text((x + 22 - tw / 2, y + 8), num, font=nf, fill=(11, 18, 32))
    d.text((x + 64, y - 2), title, font=font(27, True), fill=TEXT)
    d.text((x + 64, y + 34), sub, font=font(20), fill=MUTED)
    y += 104

shot1.convert("RGB").save("store/screenshot-1.png", quality=95)

# ── Shot 2: the editor with the inserted tag ─────────────────────────────
shot2 = background()
header(shot2, "A tag entra onde estava o cursor", "HTML <img> ou Markdown, escolha no popup")
editor = Image.open("store/raw/editor.png")
scale = (W - 144) / editor.width
editor = editor.resize((int(editor.width * scale), int(editor.height * scale)), Image.LANCZOS)
card = shadowed(editor)
shot2.paste(card, ((W - card.width) // 2, 300), card)

d = ImageDraw.Draw(shot2)
d.text(
    (72, 300 + card.height + 30),
    "O placeholder e trocado pela tag depois do upload. Se a insercao falhar, a URL aparece no aviso.",
    font=font(21),
    fill=MUTED,
)
shot2.convert("RGB").save("store/screenshot-2.png", quality=95)

for name in ("screenshot-1.png", "screenshot-2.png"):
    im = Image.open(f"store/{name}")
    print(name, im.size)
