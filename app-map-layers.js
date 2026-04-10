/**
 * app-map-layers.js — Map data layers for the deal pipeline map view.
 * Adds overlay layers: existing Stoa properties, heatmap, and layer controls.
 * Plain <script> (not ES module). Relies on Leaflet (L) and globals.
 */

/* jshint esversion: 11 */

// Layer group references (cleaned up when map is destroyed)
var _mapLayerGroups = {};

/**
 * Add layer controls to the map after initMap completes.
 * Call this from the map view after mapInstance is available.
 * @param {L.Map} map - The Leaflet map instance
 * @param {Array} pipelineDeals - Current pipeline deals (with lat/lng)
 */
function addMapLayers(map, pipelineDeals) {
    if (!map || typeof L === 'undefined') return;

    // Clean up previous layer groups
    Object.keys(_mapLayerGroups).forEach(function(key) {
        if (_mapLayerGroups[key] && map.hasLayer(_mapLayerGroups[key])) {
            map.removeLayer(_mapLayerGroups[key]);
        }
    });
    _mapLayerGroups = {};

    // ── Stoa Existing Properties Layer ───────────────────────────
    var stoaPropertiesLayer = L.layerGroup();
    _mapLayerGroups.stoaProperties = stoaPropertiesLayer;

    // Fetch existing properties from the API
    if (typeof API !== 'undefined' && typeof API.getClosedProperties === 'function') {
        API.getClosedProperties().then(function(res) {
            var properties = (res && res.success && res.data) ? res.data : [];
            properties.forEach(function(prop) {
                var lat = parseFloat(prop.Latitude || prop.latitude || 0);
                var lng = parseFloat(prop.Longitude || prop.longitude || 0);
                if (!lat || !lng) return;

                var name = prop.ProjectName || prop.propertyName || 'Stoa Property';
                var units = prop.UnitCount || prop.unitCount || '—';
                var city = prop.City || prop.city || '';
                var state = prop.State || prop.state || '';

                var icon = L.divIcon({
                    className: 'stoa-property-marker',
                    html: '<div class="stoa-marker-dot"></div>',
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                });

                var marker = L.marker([lat, lng], { icon: icon });
                marker.bindPopup(
                    '<div class="map-popup stoa-popup">' +
                    '<strong>' + escapeHtml(name) + '</strong><br>' +
                    '<span style="color:#6b7280;font-size:12px;">' +
                    escapeHtml(city) + (city && state ? ', ' : '') + escapeHtml(state) +
                    ' · ' + units + ' units</span>' +
                    '<div style="margin-top:4px;font-size:11px;color:#7e8a6b;font-weight:600;">EXISTING STOA PROPERTY</div>' +
                    '</div>'
                );
                stoaPropertiesLayer.addLayer(marker);
            });
        }).catch(function() {});
    }

    // ── Pipeline Deal Density Heatmap ────────────────────────────
    var heatPoints = [];
    (pipelineDeals || []).forEach(function(deal) {
        var lat = parseFloat(deal.Latitude || deal.latitude || 0);
        var lng = parseFloat(deal.Longitude || deal.longitude || 0);
        if (lat && lng) {
            var units = parseInt(deal['Unit Count'] || deal.UnitCount || deal.unitCount || 1) || 1;
            heatPoints.push([lat, lng, Math.min(units / 100, 1)]); // intensity based on units
        }
    });

    // Simple circle-based heatmap (no extra library needed)
    var heatLayer = L.layerGroup();
    _mapLayerGroups.heatmap = heatLayer;
    heatPoints.forEach(function(pt) {
        L.circle([pt[0], pt[1]], {
            radius: 50000 * (0.3 + pt[2] * 0.7), // 15-50km radius based on intensity
            color: 'transparent',
            fillColor: '#7e8a6b',
            fillOpacity: 0.15 + pt[2] * 0.15,
            interactive: false
        }).addTo(heatLayer);
    });

    // ── Layer Control ────────────────────────────────────────────
    // Remove existing control if present
    if (map._stoaLayerControl) {
        map.removeControl(map._stoaLayerControl);
    }

    var overlays = {
        '🏠 Stoa Properties': stoaPropertiesLayer,
        '🔥 Deal Density': heatLayer
    };

    map._stoaLayerControl = L.control.layers(null, overlays, {
        position: 'topright',
        collapsed: true
    }).addTo(map);

    // Add the layer toggle panel HTML
    _addLayerToggleUI(map, overlays);
}

/**
 * Add a custom layer toggle panel below the map controls.
 */
function _addLayerToggleUI(map, overlays) {
    var existing = document.getElementById('map-layer-toggles');
    if (existing) existing.remove();

    var container = map.getContainer().parentElement;
    if (!container) return;

    var panel = document.createElement('div');
    panel.id = 'map-layer-toggles';
    panel.className = 'map-layer-toggles';
    panel.innerHTML =
        '<div class="map-layer-toggles-header">Layers</div>' +
        '<div class="map-layer-toggles-body">' +
        Object.keys(overlays).map(function(name) {
            var id = 'layer-toggle-' + name.replace(/[^a-z]/gi, '');
            return '<label class="map-layer-toggle-item">' +
                '<input type="checkbox" id="' + id + '" data-layer-name="' + name + '"> ' +
                '<span>' + name + '</span>' +
                '</label>';
        }).join('') +
        '</div>';

    container.appendChild(panel);

    // Wire up toggle events
    panel.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
        cb.addEventListener('change', function() {
            var layerName = cb.getAttribute('data-layer-name');
            var layer = overlays[layerName];
            if (!layer) return;
            if (cb.checked) {
                map.addLayer(layer);
            } else {
                map.removeLayer(layer);
            }
        });
    });
}

/**
 * Remove all custom layers from the map (call before map destroy).
 */
function removeMapLayers(map) {
    if (!map) return;
    Object.keys(_mapLayerGroups).forEach(function(key) {
        if (_mapLayerGroups[key] && map.hasLayer(_mapLayerGroups[key])) {
            map.removeLayer(_mapLayerGroups[key]);
        }
    });
    _mapLayerGroups = {};
    if (map._stoaLayerControl) {
        map.removeControl(map._stoaLayerControl);
        map._stoaLayerControl = null;
    }
    var togglePanel = document.getElementById('map-layer-toggles');
    if (togglePanel) togglePanel.remove();
}
