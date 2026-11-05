"""Generate PastePic icons (16/32/48/128) — build-time only, not shipped code."""
from PIL import Image, ImageDraw

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded dark tile
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=112, fill=(17, 24, 39, 255))

# Photo frame
fx0, fy0, fx1, fy1 = 92, 108, 420, 372
d.rounded_rectangle([fx0, fy0, fx1, fy1], radius=30, fill=(249, 250, 251, 255))

# Sun
d.ellipse([fx1 - 118, fy0 + 34, fx1 - 58, fy0 + 94], fill=(34, 197, 94, 255))

# Mountains (clipped to the frame by drawing inside it)
mount = Image.new("RGBA", (S, S), (0, 0, 0, 0))
md = ImageDraw.Draw(mount)
md.polygon([(fx0 + 30, fy1 - 24), (fx0 + 150, fy1 - 150), (fx0 + 250, fy1 - 24)], fill=(17, 24, 39, 255))
md.polygon([(fx0 + 170, fy1 - 24), (fx0 + 260, fy1 - 112), (fx0 + 356, fy1 - 24)], fill=(31, 41, 55, 255))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([fx0, fy0, fx1, fy1], radius=30, fill=255)
img.paste(mount, (0, 0), Image.composite(mask, Image.new("L", (S, S), 0), mount.split()[3]))

# Paste arrow badge (bottom-right): green disc + white arrow
bx, by, br = 392, 392, 86
d.ellipse([bx - br, by - br, bx + br, by + br], fill=(34, 197, 94, 255))
d.rectangle([bx - 12, by - 44, bx + 12, by + 6], fill=(255, 255, 255, 255))
d.polygon([(bx - 34, by - 2), (bx + 34, by - 2), (bx, by + 40)], fill=(255, 255, 255, 255))

for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(f"icons/icon{size}.png")

img.resize((512, 512), Image.LANCZOS).save("icons/icon512.png")
print("icons written")
