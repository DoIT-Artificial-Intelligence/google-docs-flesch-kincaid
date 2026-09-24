# /// script
# dependencies = [
#   "pillow",
# ]
# ///
"""Build Marketplace store listing images from icon-source.jpg."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONT_DIR = Path("/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF")
BLUE = (0, 120, 212)

# Crop the whitespace around the artwork so it fills the icon.
src = Image.open(HERE / "icon-source.jpg").convert("RGB")
icon = src.crop((200, 180, 900, 880))

for size in (128, 32):
    icon.resize((size, size), Image.LANCZOS).save(HERE / f"icon-{size}.png")

# Card banner: 220x140.
banner = Image.new("RGB", (220, 140), "white")
draw = ImageDraw.Draw(banner)
draw.rectangle((0, 0, 220, 5), fill=BLUE)
banner.paste(icon.resize((64, 64), Image.LANCZOS), (78, 16))
title = ImageFont.truetype(str(FONT_DIR / "Roboto-Bold.ttf"), 16)
sub = ImageFont.truetype(str(FONT_DIR / "Roboto-Regular.ttf"), 11)
draw.text((110, 98), "Flesch-Kincaid Readability", font=title, fill=(50, 49, 48), anchor="mm")
draw.text((110, 120), "Grade level & reading ease", font=sub, fill=(96, 94, 92), anchor="mm")
banner.save(HERE / "banner-220x140.png")
