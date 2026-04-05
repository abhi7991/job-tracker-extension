"""
Run once to generate the PNG icons needed by Chrome.
  pip install Pillow
  python generate_icons.py
"""
from PIL import Image, ImageDraw

SIZES = [16, 48, 128]

for size in SIZES:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    pad = max(1, size // 10)
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=size // 5,
        fill=(108, 99, 255, 255),   # --accent #6c63ff
    )

    # Simple grid lines (spreadsheet icon)
    lw = max(1, size // 20)
    col = (255, 255, 255, 200)
    third = size // 3

    # Vertical divider
    draw.line([(pad + third, pad + lw * 2), (pad + third, size - pad - lw)], fill=col, width=lw)
    # Horizontal divider
    draw.line([(pad + lw, pad + third), (size - pad - lw, pad + third)], fill=col, width=lw)

    img.save(f"icons/icon{size}.png")
    print(f"Created icons/icon{size}.png")

print("Done.")
