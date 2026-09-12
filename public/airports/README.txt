Airport banner images for the homepage airport buttons.

Put one JPG per airport here, named by its UPPERCASE IATA code + ".jpg".
The filename case matters on Vercel (Linux), so use uppercase exactly:

  public/airports/NRT.jpg   ← Narita (成田)
  public/airports/HND.jpg   ← Haneda (羽田)
  public/airports/KIX.jpg   ← Kansai (関西)
  public/airports/NGO.jpg   ← Centrair / Nagoya (中部)
  public/airports/FUK.jpg   ← Fukuoka (福岡)
  public/airports/CTS.jpg   ← New Chitose / Sapporo (新千歳)
  public/airports/SDJ.jpg   ← Sendai (仙台)
  public/airports/HIJ.jpg   ← Hiroshima (広島)
  public/airports/KMJ.jpg   ← Kumamoto (熊本)
  public/airports/OKA.jpg   ← Naha / Okinawa (那覇)  [optional]

Notes
- Recommended aspect ratio ~3:2 (the cards are rendered at aspect-[3/2]).
- Any airport without an image here automatically falls back to an emoji card,
  so the page never breaks if a file is missing.
- .png also works if you change the extension in the code (currently .jpg).
  To use PNG instead, replace `/airports/${ap.code}.jpg` with `.png` in
  components/FrontendApp.jsx (AirportCard + the search-modal thumbnail).
