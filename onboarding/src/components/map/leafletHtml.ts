import { MARINDUQUE_CENTER, MARINDUQUE_ISLAND, MARINDUQUE_PAN_LIMIT, MARINDUQUE_ZOOM } from '@/constants/zones';
import { colors } from '@/theme';

// The map page shown inside a WebView (phone) or an iframe (web). OpenStreetMap standard tiles:
// no key, attribution required, light interactive use only (OSM tile usage policy).
// Host -> map: window.__receive(json). Map -> host: ReactNativeWebView.postMessage or parent.postMessage.
// Drawn in the same flat 2D style as the Home sea scene: a banca for "you", fish for catches,
// a badge on each zone, a hand-drawn compass and moving waves. Motion stops under reduced motion.

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

// The banca from the Home scene, cropped to the boat.
const BOAT_SVG = `<svg viewBox="74 118 158 94" width="52" height="31" aria-hidden="true">
<path d="M152 190 L152 124" stroke="${colors.sea900}" stroke-width="5" stroke-linecap="round"/>
<path d="M155 128 L155 182 L194 177 Z" fill="${colors.coral500}"/>
<path d="M100 186 C 128 200, 176 200, 206 183 C 200 195, 180 203, 152 203 C 126 203, 108 197, 100 186 Z" fill="${colors.sea900}"/>
<path d="M78 207 L228 207 M130 199 L120 207 M178 199 L188 207" stroke="${colors.sea900}" stroke-width="5" stroke-linecap="round"/>
</svg>`;

// 24x24 glyphs for zone badges; {c} is the zone color.
const GLYPHS: Record<string, string> = {
  sanctuary: '<path d="M5 12 C8 6.5,16.5 6.5,20 11.5 C16.5 16,8 17,5 12 Z M5 12 L1.5 8.5 L2.5 12 L1.5 15.5 Z" fill="{c}"/><circle cx="16.5" cy="11" r="1.1" fill="#fff"/>',
  restricted: '<circle cx="12" cy="12" r="8" fill="none" stroke="{c}" stroke-width="2.6"/><path d="M7.5 12h9" stroke="{c}" stroke-width="2.6" stroke-linecap="round"/>',
  safe: '<path d="M6 12.5l4 4 8-9" fill="none" stroke="{c}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  pollution: '<path d="M12 3.5 C12 3.5 6 10.5 6 14.5 A6 6 0 0 0 18 14.5 C18 10.5 12 3.5 12 3.5 Z" fill="{c}"/><path d="M9.8 15.8 L14.2 11.4 M14.2 15.8 L9.8 11.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
};

// A loose, slightly uneven compass rose, as if inked on a chart.
const COMPASS_SVG = `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
<circle cx="32" cy="32" r="22" fill="${colors.sand50}" fill-opacity=".85" stroke="${colors.sea700}" stroke-width="1.5"/>
<circle cx="32" cy="32" r="17" fill="none" stroke="${colors.sea300}" stroke-width="1" stroke-dasharray="2 3"/>
<path d="M32 9 L36 31 L32 29 L28 31 Z" fill="${colors.coral500}"/>
<path d="M32 55 L28 33 L32 35 L36 33 Z" fill="${colors.sea700}"/>
<path d="M9 32 L31 28 L29 32 L31 36 Z M55 32 L33 36 L35 32 L33 28 Z" fill="${colors.sea300}"/>
<text x="32" y="7.5" text-anchor="middle" font-size="8" font-weight="700" fill="${colors.sea900}" font-family="system-ui, sans-serif">N</text>
</svg>`;

// One 360-wide wave tile whose ends meet, repeated across the strip.
const WAVE_TILE = (fill: string, top: number, amp: number) =>
  `<svg viewBox="0 0 360 30" preserveAspectRatio="none" width="360" height="30"><path d="M0 ${top} C 30 ${top - amp}, 60 ${top - amp}, 90 ${top} S 150 ${top + amp}, 180 ${top} S 240 ${top - amp}, 270 ${top} S 330 ${top + amp}, 360 ${top} L360 30 L0 30 Z" fill="${fill}"/></svg>`;

export const LEAFLET_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>
  html, body, #map { height: 100%; margin: 0; background: ${colors.reef100}; }
  .leaflet-container { font: 14px/1.4 system-ui, -apple-system, Roboto, sans-serif; background: ${colors.reef100}; }
  /* Softer, flatter tiles so the drawn markers carry the color. */
  .leaflet-tile-pane { filter: saturate(.5) sepia(.18) brightness(1.04) contrast(.94); }
  .leaflet-tooltip.zone { background: ${colors.white}; border: 0; border-radius: 8px; padding: 4px 8px; color: ${colors.sea900}; font-weight: 600; box-shadow: 0 1px 4px rgba(14,42,59,.25); }
  .leaflet-popup-content { margin: 10px 12px; color: ${colors.sea900}; }
  
  .townlabel { text-align: center; color: #0B2235; font-weight: 800; font-size: 13px; letter-spacing: .6px; line-height: 1.1; text-shadow: 0 0 3px #fff, 0 0 6px #fff; pointer-events: none; }
  .townlabel span { display: block; font-weight: 600; font-size: 10px; letter-spacing: 0; opacity: .95; }
  .pin { position: relative; width: 30px; height: 38px; }
  .pin::before { content: ''; position: absolute; left: 3px; top: 0; width: 24px; height: 24px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--c); border: 3px solid #fff; box-shadow: 0 3px 6px rgba(0,0,0,.35); }
  .pin span { position: absolute; left: 11px; top: 8px; width: 8px; height: 8px; border-radius: 50%; background: #fff; }
  @media (prefers-reduced-motion: no-preference) { .leaflet-marker-icon:hover .pin { transform: translateY(-3px); transition: transform .15s ease-out; } }
  /* The OSM credit the tile licence requires, kept small and quiet; no Leaflet logo. */
  .leaflet-control-attribution { position: relative; z-index: 2; font-size: 9px; line-height: 1.3; padding: 0 4px; background: rgba(255,255,255,.55) !important; color: #5b6b75; border-radius: 4px 0 0 0; }
  .leaflet-control-attribution a { color: inherit; text-decoration: none; }

  .boat { position: relative; width: 52px; height: 40px; }
  .boat svg { position: absolute; left: 0; bottom: 6px; transform-origin: 50% 90%; }
  .boat .ring { position: absolute; left: 50%; bottom: 2px; width: 34px; height: 10px; margin-left: -17px; border-radius: 50%; border: 2px solid ${colors.reef500}; opacity: .7; }

  .badge { width: 30px; height: 30px; border-radius: 50%; background: ${colors.white}; border: 2.5px solid var(--c); box-shadow: 0 2px 0 rgba(14,42,59,.18); display: flex; align-items: center; justify-content: center; }
  .badge svg { width: 18px; height: 18px; }

  .fishpin { width: 26px; height: 26px; border-radius: 50% 50% 50% 4px; transform: rotate(-45deg); background: ${colors.coral500}; border: 2px solid ${colors.white}; box-shadow: 0 2px 0 rgba(14,42,59,.2); display: flex; align-items: center; justify-content: center; }
  .fishpin svg { transform: rotate(45deg); width: 15px; height: 15px; }

  .compass { position: absolute; left: 10px; top: 10px; z-index: 450; pointer-events: none; transform: rotate(-4deg); }
  .waves { position: absolute; left: 0; right: 0; bottom: 0; height: 30px; overflow: hidden; z-index: 450; pointer-events: none; }
  .waves .row { position: absolute; left: 0; bottom: 0; height: 30px; width: 200%; display: flex; }
  .waves .row svg { flex: 0 0 50%; width: 50%; }
  .waves .back { opacity: .55; bottom: 4px; }

  @media (prefers-reduced-motion: no-preference) {
    .boat svg { animation: bob 2.6s ease-in-out infinite; }
    .boat .ring { animation: ripple 2.6s ease-out infinite; }
    .waves .front { animation: drift 14s linear infinite; }
    .waves .back { animation: drift 22s linear infinite reverse; }
  }
  @keyframes bob { 0%, 100% { transform: translateY(0) rotate(-3deg) } 50% { transform: translateY(-3px) rotate(3deg) } }
  @keyframes ripple { from { transform: scale(.6); opacity: .8 } to { transform: scale(1.5); opacity: 0 } }
  @keyframes drift { from { transform: translateX(0) } to { transform: translateX(-50%) } }
</style>
</head>
<body>
<div id="map"></div>
<div class="compass">${COMPASS_SVG}</div>
<div class="waves">
  <div class="row back">${WAVE_TILE(colors.reef300, 14, 5)}${WAVE_TILE(colors.reef300, 14, 5)}</div>
  <div class="row front">${WAVE_TILE(colors.reef500, 20, 4)}${WAVE_TILE(colors.reef500, 20, 4)}</div>
</div>
<script src="${LEAFLET}/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function () {
  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage({ __maraine: s }, '*');
  }
  if (!window.L) { send({ type: 'error' }); return; }

  var GLYPHS = ${JSON.stringify(GLYPHS)};
  var BOAT = ${JSON.stringify(BOAT_SVG)};
  var FISH = '<svg viewBox="0 0 24 24"><path d="M5 12 C8 6.5,16.5 6.5,20 11.5 C16.5 16,8 17,5 12 Z M5 12 L1.5 8.5 L2.5 12 L1.5 15.5 Z" fill="#fff"/></svg>';

  // The map stays on Marinduque: it cannot be dragged past PAN_LIMIT (viscosity 1 = a hard wall, no
  // rubber-banding) and cannot be zoomed out beyond the zoom that shows all of PAN_LIMIT.
  var LIMIT = L.latLngBounds(${JSON.stringify(MARINDUQUE_PAN_LIMIT)});
  var ISLAND = L.latLngBounds(${JSON.stringify(MARINDUQUE_ISLAND)});
  var map = L.map('map', { zoomControl: false, attributionControl: true, maxBounds: LIMIT, maxBoundsViscosity: 1.0, zoomSnap: 0.5 })
    .setView([${MARINDUQUE_CENTER.lat}, ${MARINDUQUE_CENTER.lng}], ${MARINDUQUE_ZOOM});
  var fitted = false;
  function layout() {
    var s = map.getSize();
    if (!s.x || !s.y) return; // not laid out yet; the resize event runs this again
    var z = map.getBoundsZoom(LIMIT);
    if (isFinite(z)) map.setMinZoom(z);
    if (!fitted) { fitted = true; map.fitBounds(ISLAND, { animate: false }); }
  }
  layout();
  map.on('resize', layout);
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>'
  }).addTo(map);

  var townLayer = L.layerGroup().addTo(map);
  var townLabelLayer = L.layerGroup().addTo(map);
  var placeLayer = L.layerGroup().addTo(map);
  var townShapes = {};
  var placeAt = {};
  var zoneLayer = L.layerGroup().addTo(map);
  var badgeLayer = L.layerGroup().addTo(map);
  var catchLayer = L.layerGroup().addTo(map);
  var meLayer = L.layerGroup().addTo(map);
  var shapes = {};
  var me = null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  function render(d) {
    zoneLayer.clearLayers(); badgeLayer.clearLayers(); catchLayer.clearLayers(); meLayer.clearLayers(); shapes = {};
    townLayer.clearLayers(); townLabelLayer.clearLayers(); placeLayer.clearLayers(); townShapes = {}; placeAt = {};

    // Tourist mode: an illustrated map. No street tiles; each town filled in its own color.
    var tourist = d.mode === 'tourist';
    document.body.classList.toggle('tour', tourist);


    (d.towns || []).forEach(function (t) {
      var layer = L.geoJSON(t.geometry, { style: { color: t.color, weight: 2, opacity: 0.9, fillColor: t.color, fillOpacity: 0.35, lineJoin: 'round' } });
      layer.on('click', function () { map.flyToBounds(layer.getBounds(), { padding: [24, 24], duration: 0.6 }); send({ type: 'town', id: t.id }); });
      layer.addTo(townLayer);
      townShapes[t.id] = layer;
      var label = '<div class="townlabel"><b>' + esc(t.name.toUpperCase()) + '</b>' + (t.count ? '<span>' + t.count + (t.count === 1 ? ' place' : ' places') + '</span>' : '') + '</div>';
      L.marker(layer.getBounds().getCenter(), { icon: L.divIcon({ className: '', html: label, iconSize: [120, 34], iconAnchor: [60, 17] }), interactive: false }).addTo(townLabelLayer);
    });
    (d.places || []).forEach(function (p) {
      var pin = '<div class="pin" style="--c:' + p.color + '"><span></span></div>';
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: pin, iconSize: [30, 38], iconAnchor: [15, 36] }), title: p.name, riseOnHover: true })
        .on('click', function () { send({ type: 'place', id: p.id }); })
        .addTo(placeLayer);
      placeAt[p.id] = [p.lat, p.lng];
    });
    (d.zones || []).forEach(function (z) {
      var layer = L.geoJSON(z.geometry, {
        style: { color: z.color, weight: 2.5, opacity: 0.9, fillColor: z.color, fillOpacity: 0.16, dashArray: z.type === 'safe' ? '6 5' : null, lineJoin: 'round' }
      });
      layer.bindTooltip(esc(z.name), { className: 'zone', sticky: true, direction: 'top' });
      layer.on('click', function () { send({ type: 'zone', id: z.id }); });
      layer.addTo(zoneLayer);
      shapes[z.id] = layer;

      var glyph = (GLYPHS[z.type] || '').replace(/\\{c\\}/g, z.color);
      L.marker(layer.getBounds().getCenter(), {
        icon: L.divIcon({ className: '', html: '<div class="badge" style="--c:' + z.color + '"><svg viewBox="0 0 24 24">' + glyph + '</svg></div>', iconSize: [30, 30], iconAnchor: [15, 15] }),
        title: z.name
      }).on('click', function () { send({ type: 'zone', id: z.id }); }).addTo(badgeLayer);
    });
    (d.catches || []).forEach(function (c) {
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: '', html: '<div class="fishpin">' + FISH + '</div>', iconSize: [26, 26], iconAnchor: [4, 26], popupAnchor: [9, -24] }),
        title: c.title
      }).bindPopup('<b>' + esc(c.title) + '</b><br>' + esc(c.subtitle)).addTo(catchLayer);
    });
    me = d.me;
    if (me) {
      if (me.accuracyM) L.circle([me.lat, me.lng], { radius: me.accuracyM, weight: 1, color: '${colors.sea700}', fillColor: '${colors.reef300}', fillOpacity: 0.15 }).addTo(meLayer);
      L.marker([me.lat, me.lng], {
        icon: L.divIcon({ className: '', html: '<div class="boat"><span class="ring"></span>' + BOAT + '</div>', iconSize: [52, 40], iconAnchor: [26, 36] }),
        keyboard: false, zIndexOffset: 1000, title: 'You are here'
      }).addTo(meLayer);
    }
  }

  function handle(m) {
    if (!m) return;
    if (m.type === 'data') render(m.data);
    else if (m.type === 'focusTown' && townShapes[m.id]) map.flyToBounds(townShapes[m.id].getBounds(), { padding: [24, 24], duration: 0.6 });
    else if (m.type === 'focusPlace' && placeAt[m.id]) map.flyTo(placeAt[m.id], Math.max(map.getZoom(), 14), { duration: 0.8 });
    else if (m.type === 'focusZone' && shapes[m.id]) map.flyToBounds(shapes[m.id].getBounds(), { padding: [32, 32], maxZoom: 15, duration: 0.6 });
    // Someone outside Marinduque (testing from home, say) stays put instead of being pushed to a corner.
    else if (m.type === 'focusMe' && me && LIMIT.contains([me.lat, me.lng])) map.flyTo([me.lat, me.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    else if (m.type === 'home') map.flyToBounds(ISLAND, { duration: 0.6 });
  }

  window.__receive = function (json) { try { handle(JSON.parse(json)); } catch (e) {} };
  send({ type: 'ready' });
})();
</script>
</body>
</html>`;
