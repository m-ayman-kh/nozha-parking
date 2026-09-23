"""Make the QR codes that citizens scan.

qr.png / qr.svg        general code: opens the whole map
qr/<sign-id>.svg       one code per street sign (signs.json): opens the map at that sign

Usage: python make_qr.py [base-url]
Add a sign to signs.json with the spot where it will be mounted, then run this again.
"""
import json, os, sys, qrcode, qrcode.image.svg

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://m-ayman-kh.github.io/nozha-parking/"

def svg(url, path):
    qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, border=2,
                error_correction=qrcode.constants.ERROR_CORRECT_M).save(path)

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=20, border=2)
qr.add_data(BASE)
qr.make_image(fill_color="black", back_color="white").save("../qr.png")
svg(BASE, "../qr.svg")
print("general ->", BASE)

os.makedirs("../qr", exist_ok=True)
signs = json.load(open("signs.json"))
for s in signs:
    url = f"{BASE}?lat={s['lat']}&lng={s['lng']}"
    svg(url, f"../qr/{s['id']}.svg")
    print(f"{s['id']:>20} -> {url}")
json.dump(signs, open("../qr/signs.json", "w"), ensure_ascii=False, indent=1)  # read by sign.html
