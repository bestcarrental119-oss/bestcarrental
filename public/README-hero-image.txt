## Banner carousel setup

The hero section in HomePage uses these public files:
  /hero-banner-1.jpeg
  /hero-banner-2.jpeg
  /hero-banner-3.jpeg
  /hero-banner-4.jpeg

The initial images are rendered as an auto-rotating carousel with manual
previous, next, and dot controls (see FrontendApp.jsx -> HomePage).

Admins can add, remove, and reorder banners from Admin Panel -> Banner Manager.
The banner list is saved through /api/banners and hydrated through /api/data.
