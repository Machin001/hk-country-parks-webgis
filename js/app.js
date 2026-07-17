/**
 * Hong Kong Country Park Facilities Explorer
 * Main Application JavaScript
 */
$(function () {
    'use strict';

    // ===== Configuration =====
    const CONFIG = {
        geoserverWMS: 'https://webgis26-msh3619.xyz/geoserver/wms',
        geoserverWFS: 'https://webgis26-msh3619.xyz/geoserver/wfs',
        apiBase: 'api',
        osrmRouteUrl: 'https://router.project-osrm.org/route/v1/foot/',  // Walking route
        defaultCenter: [22.35, 114.18],
        defaultZoom: 11,
        layers: {
            country_parks: {
                wmsLayer: 'hk_data:country_parks',
                color: '#e74c3c',
                fillColor: '#e74c3c',
                fillOpacity: 0.3,
                radius: 8,
                titleField: 'name_en',
            },
            hiking_trails: {
                wmsLayer: 'hk_data:hiking_trails',
                color: '#3498db',
                weight: 3,
                titleField: 'trail_name_en',
            },
            visitor_centres: {
                wmsLayer: 'hk_data:visitor_centres',
                color: '#f39c12',
                fillColor: '#f39c12',
                fillOpacity: 0.4,
                radius: 7,
                titleField: 'facility_name_en',
            },
            campsites: {
                wmsLayer: 'hk_data:campsites',
                color: '#8e44ad',
                fillColor: '#8e44ad',
                fillOpacity: 0.4,
                radius: 6,
                titleField: 'facility_name_en',
            },
        },
    };

    // ===== State =====
    const state = {
        geojsonLayers: {},
        wmsLayers: {},
        overlays: {},
        visible: {
            country_parks: true,
            hiking_trails: true,
            visitor_centres: false,
            campsites: false,
        },
        userLocation: null,       // L.latLng
        locationMarker: null,     // L.circleMarker
        locationAccuracy: null,   // L.circle
        routeLayer: null,         // L.polyline
        tracking: false,
        watchId: null,
        lastDetailTarget: null,   // {layerKey, id}
    };

    // ===== Initialize Map =====
    const map = L.map('map', {
        center: CONFIG.defaultCenter,
        zoom: CONFIG.defaultZoom,
        zoomControl: true,
    });

    // Base map - OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
    }).addTo(map);

    // ===== Layer Management =====
    function initLayers() {
        Object.keys(CONFIG.layers).forEach(function (layerKey) {
            const cfg = CONFIG.layers[layerKey];
            const wms = L.tileLayer.wms(CONFIG.geoserverWMS, {
                layers: cfg.wmsLayer,
                format: 'image/png',
                transparent: true,
                opacity: layerKey === 'hiking_trails' ? 0.7 : 0.8,
                attribution: 'CSDI',
            });
            state.wmsLayers[layerKey] = wms;
            const group = L.layerGroup().addTo(map);
            state.overlays[layerKey] = group;
            if (state.visible[layerKey]) {
                wms.addTo(map);
            }
        });
        loadPointLayer('country_parks');
        loadPointLayer('visitor_centres');
        loadPointLayer('campsites');
    }

    function loadPointLayer(layerKey) {
        const cfg = CONFIG.layers[layerKey];
        const url = CONFIG.apiBase + '/get_features.php?layer=' + layerKey + '&limit=500';
        const group = state.overlays[layerKey];
        if (!state.visible[layerKey]) {
            group.clearLayers();
            return;
        }
        $.getJSON(url, function (data) {
            const geojsonLayer = L.geoJSON(data, {
                pointToLayer: function (feature, latlng) {
                    return L.circleMarker(latlng, {
                        radius: cfg.radius || 6,
                        fillColor: cfg.fillColor || cfg.color,
                        color: cfg.color,
                        weight: 2,
                        opacity: 1,
                        fillOpacity: cfg.fillOpacity || 0.3,
                    });
                },
                onEachFeature: function (feature, layer) {
                    const props = feature.properties;
                    const popupContent = buildPopupContent(layerKey, props, feature);
                    layer.bindPopup(popupContent, { maxWidth: 320, className: 'facility-popup' });
                },
            });
            group.clearLayers();
            group.addLayer(geojsonLayer);
            state.geojsonLayers[layerKey] = geojsonLayer;
        });
    }

    function buildPopupContent(layerKey, props, feature) {
        let html = '<div class="popup-title">' + escapeHtml(props.name_en || props.name || '') + '</div>';
        if (props.name_tc) {
            html += '<div class="popup-field">' + escapeHtml(props.name_tc) + '</div>';
        }

        const fieldMap = {
            country_parks: [],
            hiking_trails: [
                ['type_en', 'Type'], ['difficulty_en', 'Difficulty'], ['region_en', 'Region'],
            ],
            visitor_centres: [
                ['country_park_en', 'Country Park'], ['service_hour_en', 'Service Hours'],
            ],
            campsites: [
                ['country_park_en', 'Country Park'], ['tent_space_en', 'Tent Space'], ['source_of_water_en', 'Water Source'],
            ],
        };
        const fields = fieldMap[layerKey] || [];
        fields.forEach(function (f) {
            if (props[f[0]]) {
                html += '<div class="popup-field"><strong>' + f[1] + ':</strong> ' + escapeHtml(props[f[0]]) + '</div>';
            }
        });

        if (props.id) {
            html += '<div style="margin-top:8px;display:flex;gap:8px;">';
            html += '<a class="popup-btn popup-btn-detail" href="#" data-layer="' + layerKey + '" data-id="' + props.id + '">View Details</a>';
            if (feature.geometry && feature.geometry.coordinates) {
                html += '<a class="popup-btn popup-btn-route" href="#" data-lat="' + feature.geometry.coordinates[1] + '" data-lng="' + feature.geometry.coordinates[0] + '" data-name="' + escapeHtml(props.name_en || props.name || '') + '">Route Here</a>';
            }
            html += '</div>';
        }

        return html;
    }

    function toggleLayer(layerKey, visible) {
        state.visible[layerKey] = visible;
        const wms = state.wmsLayers[layerKey];
        const group = state.overlays[layerKey];
        if (visible) {
            if (wms) map.addLayer(wms);
            loadPointLayer(layerKey);
        } else {
            if (wms) map.removeLayer(wms);
            group.clearLayers();
        }
    }

    // ===== Detail Panel =====
    function showDetailPanel(layerKey, id) {
        state.lastDetailTarget = { layerKey: layerKey, id: id };
        const url = CONFIG.apiBase + '/get_detail.php?layer=' + layerKey + '&id=' + id;
        $.getJSON(url, function (data) {
            if (data.error) return;
            const props = data.properties;
            const titleField = CONFIG.layers[layerKey].titleField;
            $('#detail-title').text(props[titleField] || 'Details');

            let gridHtml = '';
            Object.keys(props).forEach(function (key) {
                if (key === 'objectid') return;
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                let value = props[key];
                if (value && typeof value === 'string' && value.startsWith('http')) {
                    value = '<a href="' + escapeHtml(value) + '" target="_blank" rel="noopener">' + escapeHtml(value) + '</a>';
                } else {
                    value = escapeHtml(String(value));
                }
                gridHtml += '<div class="detail-item"><div class="label">' + escapeHtml(label) + '</div><div class="value">' + value + '</div></div>';
            });

            // Add route button in detail panel if geometry exists
            if (data.geometry && data.geometry.coordinates) {
                const coords = data.geometry.coordinates;
                gridHtml += '<div class="detail-item" style="grid-column:1/-1;margin-top:8px;padding-top:8px;border-top:1px solid #eee;">';
                gridHtml += '<button class="route-btn" id="detail-route-btn" data-lat="' + coords[1] + '" data-lng="' + coords[0] + '">Navigate Here</button>';
                gridHtml += '</div>';
            }

            $('#detail-grid').html(gridHtml);
            $('#detail-panel').slideDown(200);

            if (data.geometry && data.geometry.coordinates) {
                const coords = data.geometry.coordinates;
                const latlng = L.latLng(coords[1], coords[0]);
                map.panTo(latlng, { animate: true });
            }
        });
    }

    // ===== Popup link handlers (bound on document to work inside Leaflet popups) =====
    $(document).on('click', '.popup-btn-detail', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var layerKey = $(this).data('layer');
        var id = $(this).data('id');
        if (layerKey && id) {
            showDetailPanel(layerKey, id);
            map.closePopup();
        }
    });

    $(document).on('click', '.popup-btn-route', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var lat = $(this).data('lat');
        var lng = $(this).data('lng');
        var name = $(this).data('name') || 'Destination';
        map.closePopup();
        routeToDestination(lat, lng, name);
    });

    // ===== Search =====
    let searchTimer = null;
    $('#search-input').on('input', function () {
        clearTimeout(searchTimer);
        const q = $(this).val().trim();
        if (q.length < 2) {
            $('#search-results').hide().empty();
            return;
        }
        searchTimer = setTimeout(function () { performSearch(q); }, 300);
    });

    $('#search-input').on('focus', function () {
        if ($('#search-results').children().length > 0) $('#search-results').show();
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('#search-box').length) $('#search-results').hide();
    });

    function performSearch(query) {
        $.getJSON(CONFIG.apiBase + '/search.php', { q: query }, function (data) {
            if (data.count === 0) {
                $('#search-results').html('<div style="padding:16px;color:#999;text-align:center;">No results found</div>').show();
                return;
            }
            let html = '';
            data.results.forEach(function (r) {
                html += '<div class="search-result-item" data-layer="' + r.layer + '" data-id="' + r.id + '">'
                    + '<div class="sr-name">' + escapeHtml(r.name) + '</div>'
                    + '<div class="sr-detail">' + escapeHtml(r.detail || r.name_tc || '') + '</div>'
                    + '<span class="sr-layer">' + r.layer.replace('_', ' ') + '</span>'
                    + '</div>';
            });
            $('#search-results').html(html).show();
        });
    }

    $(document).on('click', '.search-result-item', function () {
        const layer = $(this).data('layer');
        const id = $(this).data('id');
        if (!state.visible[layer]) {
            const checkboxId = { country_parks: 'layer-parks', hiking_trails: 'layer-trails', visitor_centres: 'layer-centres', campsites: 'layer-campsites' }[layer];
            $('#' + checkboxId).prop('checked', true);
            toggleLayer(layer, true);
        }
        $.getJSON(CONFIG.apiBase + '/get_detail.php?layer=' + layer + '&id=' + id, function (data) {
            if (data.geometry && data.geometry.coordinates) {
                const coords = data.geometry.coordinates;
                const latlng = L.latLng(coords[1], coords[0]);
                map.setView(latlng, 15, { animate: true });
                if (state.geojsonLayers[layer]) {
                    state.geojsonLayers[layer].eachLayer(function (l) {
                        const fc = l.feature.geometry.coordinates;
                        if (fc[0] === coords[0] && fc[1] === coords[1]) l.openPopup();
                    });
                }
            }
            showDetailPanel(layer, id);
        });
        $('#search-results').hide();
        $('#search-input').val('');
    });

    // ===== Park / District Filter =====
    const filterState = {
        parks: [],
        districts: [],
        parkDistrictMap: {},
        activeType: null,   // 'park' or 'district'
        activeValue: null,  // selected park or district name_en
    };

    function loadFilterData() {
        $.getJSON(CONFIG.apiBase + '/get_filter_data.php', function (data) {
            filterState.parks = data.parks || [];
            filterState.districts = data.districts || [];
            filterState.parkDistrictMap = data.park_district_map || {};
            renderParkList(filterState.parks);
            renderDistrictList(filterState.districts);
        });
    }

    function renderParkList(parks) {
        const $list = $('#park-filter-list');
        if (!parks.length) {
            $list.html('<div class="filter-list-empty">No parks found</div>');
            return;
        }
        let html = '';
        parks.forEach(function (p) {
            const isActive = filterState.activeType === 'park' && filterState.activeValue === p.name_en;
            html += '<div class="filter-item' + (isActive ? ' active' : '') + '" data-type="park" data-value="' + escapeHtml(p.name_en) + '">'
                + '<span class="filter-item-dot"></span>'
                + '<span class="filter-item-name">' + escapeHtml(p.name_en) + '<small>' + escapeHtml(p.name_tc || '') + '</small></span>'
                + '</div>';
        });
        $list.html(html);
    }

    function renderDistrictList(districts) {
        const $list = $('#district-filter-list');
        if (!districts.length) {
            $list.html('<div class="filter-list-empty">No districts found</div>');
            return;
        }
        // Count parks per district
        const counts = {};
        filterState.parks.forEach(function (p) {
            const d = filterState.parkDistrictMap[p.name_en];
            if (d) counts[d] = (counts[d] || 0) + 1;
        });
        let html = '';
        districts.forEach(function (d) {
            const isActive = filterState.activeType === 'district' && filterState.activeValue === d.name_en;
            const count = counts[d.name_en] || 0;
            html += '<div class="filter-item' + (isActive ? ' active' : '') + '" data-type="district" data-value="' + escapeHtml(d.name_en) + '">'
                + '<span class="filter-item-dot"></span>'
                + '<span class="filter-item-name">' + escapeHtml(d.name_en) + '<small>' + escapeHtml(d.name_tc || '') + '</small></span>'
                + (count ? '<span class="filter-item-count">' + count + '</span>' : '')
                + '</div>';
        });
        $list.html(html);
    }

    // Tab switching
    $(document).on('click', '.filter-tab', function () {
        const tab = $(this).data('filter');
        $('.filter-tab').removeClass('active');
        $(this).addClass('active');
        $('.filter-panel').removeClass('active');
        $('#filter-panel-' + tab).addClass('active');
    });

    // Filter item click
    $(document).on('click', '.filter-item', function () {
        const type = $(this).data('type');
        const value = $(this).data('value');
        // If clicking the same item, deselect it
        if (filterState.activeType === type && filterState.activeValue === value) {
            clearFilter();
            return;
        }
        filterState.activeType = type;
        filterState.activeValue = value;

        // Update active state in both lists
        $('.filter-item').removeClass('active');
        $('.filter-item[data-type="' + type + '"][data-value="' + value + '"]').addClass('active');

        // Show active filter bar
        const label = type === 'park' ? value : value + ' (District)';
        $('#active-filter-label').text(label);
        $('#active-filter-bar').show();

        // Apply filter
        if (type === 'park') {
            applyParkFilter(value);
        } else {
            applyDistrictFilter(value);
        }
    });

    // Clear filter
    $(document).on('click', '#btn-clear-filter', function () {
        clearFilter();
    });

    function clearFilter() {
        filterState.activeType = null;
        filterState.activeValue = null;
        $('.filter-item').removeClass('active');
        $('#active-filter-bar').hide();
        applyParkFilter('');
    }

    // Search within filter lists
    $(document).on('input', '#park-search-input', function () {
        const q = $(this).val().toLowerCase();
        const filtered = filterState.parks.filter(function (p) {
            return p.name_en.toLowerCase().indexOf(q) !== -1
                || (p.name_tc && p.name_tc.indexOf(q) !== -1);
        });
        renderParkList(filtered);
    });

    $(document).on('input', '#district-search-input', function () {
        const q = $(this).val().toLowerCase();
        const filtered = filterState.districts.filter(function (d) {
            return d.name_en.toLowerCase().indexOf(q) !== -1
                || (d.name_tc && d.name_tc.indexOf(q) !== -1);
        });
        renderDistrictList(filtered);
    });

    function applyDistrictFilter(district) {
        // Find all parks in this district via the mapping
        const parksInDistrict = [];
        filterState.parks.forEach(function (p) {
            if (filterState.parkDistrictMap[p.name_en] === district) {
                parksInDistrict.push(p.name_en);
            }
        });

        Object.keys(CONFIG.layers).forEach(function (layerKey) {
            const wms = state.wmsLayers[layerKey];
            if (wms) {
                if (district) {
                    wms.setParams({ CQL_FILTER: null });
                    if (layerKey === 'country_parks') {
                        if (parksInDistrict.length > 0) {
                            const parkClauses = parksInDistrict.map(function (pn) {
                                return "name_en ILIKE '%" + pn.replace(/'/g, "''") + "%'";
                            });
                            wms.setParams({ CQL_FILTER: parkClauses.join(' OR ') });
                        }
                    } else if (layerKey === 'hiking_trails') {
                        wms.setParams({ CQL_FILTER: "region_en ILIKE '%" + district.replace(/'/g, "''") + "%'" });
                    } else {
                        if (parksInDistrict.length > 0) {
                            const parkClauses = parksInDistrict.map(function (pn) {
                                return "country_park_en ILIKE '%" + pn.replace(/'/g, "''") + "%'";
                            });
                            wms.setParams({ CQL_FILTER: parkClauses.join(' OR ') });
                        }
                    }
                } else {
                    wms.setParams({ CQL_FILTER: null });
                }
            }
            if (['country_parks', 'visitor_centres', 'campsites'].indexOf(layerKey) !== -1) {
                if (state.visible[layerKey]) {
                    let url = CONFIG.apiBase + '/get_features.php?layer=' + layerKey + '&limit=500';
                    if (district && parksInDistrict.length > 0) {
                        // Pass the first matching park (API does ILIKE, so it'll catch related)
                        url += '&park=' + encodeURIComponent(parksInDistrict[0]);
                    }
                    $.getJSON(url, function (data) {
                        const cfg = CONFIG.layers[layerKey];
                        const group = state.overlays[layerKey];
                        const gj = L.geoJSON(data, {
                            pointToLayer: function (feature, latlng) {
                                return L.circleMarker(latlng, { radius: cfg.radius || 6, fillColor: cfg.fillColor || cfg.color, color: cfg.color, weight: 2, opacity: 1, fillOpacity: cfg.fillOpacity || 0.3 });
                            },
                            onEachFeature: function (feature, layer) {
                                layer.bindPopup(buildPopupContent(layerKey, feature.properties, feature));
                            },
                        });
                        group.clearLayers();
                        group.addLayer(gj);
                        state.geojsonLayers[layerKey] = gj;
                    });
                }
            }
        });
    }

    function applyParkFilter(park) {
        Object.keys(CONFIG.layers).forEach(function (layerKey) {
            const wms = state.wmsLayers[layerKey];
            if (wms) {
                if (park) {
                    wms.setParams({ CQL_FILTER: null });
                    if (layerKey === 'country_parks') {
                        wms.setParams({ CQL_FILTER: "name_en ILIKE '%" + park.replace(/'/g, "''") + "%'" });
                    } else if (layerKey === 'hiking_trails') {
                        wms.setParams({ CQL_FILTER: "region_en ILIKE '%" + park.replace(/'/g, "''") + "%'" });
                    } else {
                        wms.setParams({ CQL_FILTER: "country_park_en ILIKE '%" + park.replace(/'/g, "''") + "%'" });
                    }
                } else {
                    wms.setParams({ CQL_FILTER: null });
                }
            }
            if (['country_parks', 'visitor_centres', 'campsites'].indexOf(layerKey) !== -1) {
                if (state.visible[layerKey]) {
                    let url = CONFIG.apiBase + '/get_features.php?layer=' + layerKey + '&limit=500';
                    if (park) url += '&park=' + encodeURIComponent(park);
                    $.getJSON(url, function (data) {
                        const cfg = CONFIG.layers[layerKey];
                        const group = state.overlays[layerKey];
                        const gj = L.geoJSON(data, {
                            pointToLayer: function (feature, latlng) {
                                return L.circleMarker(latlng, { radius: cfg.radius || 6, fillColor: cfg.fillColor || cfg.color, color: cfg.color, weight: 2, opacity: 1, fillOpacity: cfg.fillOpacity || 0.3 });
                            },
                            onEachFeature: function (feature, layer) {
                                layer.bindPopup(buildPopupContent(layerKey, feature.properties, feature));
                            },
                        });
                        group.clearLayers();
                        group.addLayer(gj);
                        state.geojsonLayers[layerKey] = gj;
                    });
                }
            }
        });
    }

    // Initialize filter data
    loadFilterData();

    // ===== Geolocation =====
    function initGeolocation() {
        if (!navigator.geolocation) {
            $('#loc-status').text('Geolocation not supported');
            return;
        }
    }

    $('#btn-locate').on('click', function () {
        locateUser(false);
    });

    $('#btn-track').on('click', function () {
        if (state.tracking) {
            stopTracking();
        } else {
            locateUser(true);
        }
    });

    function locateUser(startTracking) {
        $('#loc-status').text('Locating...').show();
        navigator.geolocation.getCurrentPosition(
            function (position) {
                updateUserLocation(position);
                map.setView(state.userLocation, 15, { animate: true });
                $('#loc-status').text('Location acquired').hide();
                if (startTracking) {
                    startTrackingFn();
                }
            },
            function (error) {
                let msg = 'Location failed';
                if (error.code === 1) msg = 'Permission denied';
                else if (error.code === 2) msg = 'Position unavailable';
                else if (error.code === 3) msg = 'Timeout';
                $('#loc-status').text(msg).show();
                setTimeout(function () { $('#loc-status').fadeOut(); }, 3000);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }

    function updateUserLocation(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        state.userLocation = L.latLng(lat, lng);

        // Accuracy circle
        if (state.locationAccuracy) map.removeLayer(state.locationAccuracy);
        state.locationAccuracy = L.circle([lat, lng], {
            radius: accuracy,
            color: '#3498db',
            fillColor: '#3498db',
            fillOpacity: 0.08,
            weight: 1,
        }).addTo(map);

        // User marker
        if (state.locationMarker) map.removeLayer(state.locationMarker);
        state.locationMarker = L.circleMarker([lat, lng], {
            radius: 8,
            color: '#2980b9',
            fillColor: '#3498db',
            fillOpacity: 1,
            weight: 3,
        }).addTo(map);
        state.locationMarker.bindPopup('<div class="popup-title">Your Location</div><div class="popup-field">Lat: ' + lat.toFixed(6) + '</div><div class="popup-field">Lng: ' + lng.toFixed(6) + '</div><div class="popup-field">Accuracy: ~' + Math.round(accuracy) + 'm</div>');
    }

    function startTrackingFn() {
        state.tracking = true;
        $('#btn-track').addClass('tracking-active').text('Stop Tracking');
        state.watchId = navigator.geolocation.watchPosition(
            updateUserLocation,
            function () {},
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );
    }

    function stopTracking() {
        state.tracking = false;
        $('#btn-track').removeClass('tracking-active').text('Track Me');
        if (state.watchId !== null) {
            navigator.geolocation.clearWatch(state.watchId);
            state.watchId = null;
        }
    }

    // ===== Route Planning (OSRM) =====
    function routeToDestination(destLat, destLng, destName) {
        if (!state.userLocation) {
            locateUser(false);
            // Store destination for after location is acquired
            state.pendingRoute = { lat: destLat, lng: destLng, name: destName };
            $('#loc-status').text('Getting your location first...').show();
            return;
        }

        clearRoute();

        const origin = state.userLocation.lng + ',' + state.userLocation.lat;
        const dest = destLng + ',' + destLat;
        const url = CONFIG.osrmRouteUrl + origin + ';' + dest + '?overview=full&geometries=geojson&steps=true';

        $('#route-info').html('<span class="route-loading">Calculating route...</span>').show();

        $.getJSON(url, function (data) {
            if (!data.routes || data.routes.length === 0) {
                $('#route-info').html('<span class="route-error">No route found</span>').show();
                return;
            }

            const route = data.routes[0];
            const coords = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });

            // Draw route
            state.routeLayer = L.polyline(coords, {
                color: '#3498db',
                weight: 5,
                opacity: 0.7,
                dashArray: '8, 6',
                lineJoin: 'round',
            }).addTo(map);

            // Draw destination marker
            L.circleMarker([destLat, destLng], {
                radius: 10,
                color: '#e74c3c',
                fillColor: '#e74c3c',
                fillOpacity: 1,
                weight: 3,
            }).addTo(map).bindPopup('<div class="popup-title">' + escapeHtml(destName) + '</div><div class="popup-field">Destination</div>').openPopup();

            // Fit map to route
            map.fitBounds(state.routeLayer.getBounds(), { padding: [50, 50] });

            // Display route info
            const distKm = (route.distance / 1000).toFixed(1);
            const durMin = Math.round(route.duration / 60);
            const hours = Math.floor(durMin / 60);
            const mins = durMin % 60;
            let timeStr = hours > 0 ? hours + 'h ' + mins + 'min' : mins + 'min';

            $('#route-info').html(
                '<div class="route-summary">'
                + '<span class="route-dist"><strong>' + distKm + ' km</strong></span>'
                + '<span class="route-time"><strong>' + timeStr + '</strong> (walking)</span>'
                + '</div>'
                + '<button class="route-clear-btn" id="route-clear-btn">Clear Route</button>'
            ).show();
        }).fail(function () {
            $('#route-info').html('<span class="route-error">Route service unavailable</span>').show();
        });
    }

    function clearRoute() {
        if (state.routeLayer) {
            map.removeLayer(state.routeLayer);
            state.routeLayer = null;
        }
        // Remove destination markers that aren't part of regular layers
        map.eachLayer(function (layer) {
            if (layer instanceof L.CircleMarker && layer.options.color === '#e74c3c' && layer.options.fillColor === '#e74c3c') {
                if (!state.overlays['country_parks'].hasLayer(layer)) {
                    map.removeLayer(layer);
                }
            }
        });
        $('#route-info').hide();
        state.pendingRoute = null;
    }

    // Delegate click for clear route and navigate buttons
    $(document).on('click', '#route-clear-btn', function () { clearRoute(); });

    $(document).on('click', '#detail-route-btn', function () {
        var lat = $(this).data('lat');
        var lng = $(this).data('lng');
        routeToDestination(lat, lng, $('#detail-title').text());
    });

    // Hook into locateUser to handle pending route after location acquired
    var _origUpdateLocation = updateUserLocation;
    updateUserLocation = function (position) {
        _origUpdateLocation(position);
        if (state.pendingRoute) {
            var r = state.pendingRoute;
            state.pendingRoute = null;
            setTimeout(function () { routeToDestination(r.lat, r.lng, r.name); }, 500);
        }
    };

    // ===== Sidebar Toggle =====
    $('.sidebar-section h3').on('click', function () {
        $(this).parent().toggleClass('collapsed');
    });

    // ===== Layer Checkbox Events =====
    $('#layer-parks').on('change', function () { toggleLayer('country_parks', this.checked); });
    $('#layer-trails').on('change', function () { toggleLayer('hiking_trails', this.checked); });
    $('#layer-centres').on('change', function () { toggleLayer('visitor_centres', this.checked); });
    $('#layer-campsites').on('change', function () { toggleLayer('campsites', this.checked); });

    // ===== Detail Panel Close =====
    $('#detail-close').on('click', function () { $('#detail-panel').slideUp(200); });

    // ===== Utility =====
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // ===== Initialize =====
    initLayers();
    // filter data loaded via loadFilterData() in filter section
    initGeolocation();
});
