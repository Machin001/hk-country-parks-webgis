<?php
/**
 * Get features from a specified layer with optional filters
 *
 * GET /api/get_features.php?layer=country_parks&limit=50&park=Lantau
 *
 * Supported layers: country_parks, hiking_trails, visitor_centres, campsites
 */
require_once __DIR__ . '/config.php';

$allowedLayers = ['country_parks', 'hiking_trails', 'visitor_centres', 'campsites'];
$layer = isset($_GET['layer']) ? $_GET['layer'] : '';
$limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 500) : 100;
$offset = isset($_GET['offset']) ? max((int)$_GET['offset'], 0) : 0;
$park = isset($_GET['park']) ? trim($_GET['park']) : '';
$bbox = isset($_GET['bbox']) ? trim($_GET['bbox']) : '';

if (!in_array($layer, $allowedLayers)) {
    jsonResponse(['error' => 'Invalid layer. Use: ' . implode(', ', $allowedLayers)], 400);
}

$db = getDB();

// Column mappings per table
$columns = [
    'country_parks' => [
        'id' => 'objectid',
        'name_en' => 'name_en',
        'name_tc' => 'name_tc',
    ],
    'hiking_trails' => [
        'id' => 'objectid',
        'name_en' => 'trail_name_en',
        'name_tc' => 'trail_name_ch',
        'type_en' => 'type_en',
        'difficulty_en' => 'difficult_en',
        'region_en' => 'region_en',
    ],
    'visitor_centres' => [
        'id' => 'objectid',
        'name_en' => 'facility_name_en',
        'name_tc' => 'facility_name_tc',
        'country_park_en' => 'country_park_en',
        'service_hour_en' => 'service_hour_en',
    ],
    'campsites' => [
        'id' => 'objectid',
        'name_en' => 'facility_name_en',
        'name_tc' => 'facility_name_tc',
        'country_park_en' => 'country_park_en',
        'tent_space_en' => 'tent_space_en',
        'water_en' => 'source_of_water_en',
    ],
];

$cols = $columns[$layer];
$selectFields = implode(', ', array_map(function ($c) use ($cols) {
    return $c . ' AS ' . array_search($c, $cols);
}, $cols));

// Build park filter
$parkFilter = '';
$params = [];
if ($layer !== 'country_parks' && $park !== '') {
    if ($layer === 'hiking_trails') {
        $parkFilter = " WHERE region_en ILIKE :park OR trail_name_en ILIKE :park2";
        $params[':park'] = '%' . $park . '%';
        $params[':park2'] = '%' . $park . '%';
    } else {
        $parkFilter = " WHERE country_park_en ILIKE :park";
        $params[':park'] = '%' . $park . '%';
    }
} elseif ($layer === 'country_parks' && $park !== '') {
    $parkFilter = " WHERE name_en ILIKE :park";
    $params[':park'] = '%' . $park . '%';
}

// Build bbox filter
if ($bbox !== '') {
    $parts = explode(',', $bbox);
    if (count($parts) === 4) {
        $bboxFilter = ($parkFilter ? ' AND' : ' WHERE') .
            " ST_Intersects(geom, ST_MakeEnvelope(:xmin,:ymin,:xmax,:ymax,4326))";
        $params[':xmin'] = (float)$parts[0];
        $params[':ymin'] = (float)$parts[1];
        $params[':xmax'] = (float)$parts[2];
        $params[':ymax'] = (float)$parts[3];
        $parkFilter .= $bboxFilter;
    }
}

// Count query
$countSql = "SELECT COUNT(*) as total FROM {$layer}" . $parkFilter;
$stmt = $db->prepare($countSql);
$stmt->execute($params);
$total = (int)$stmt->fetchColumn();

// Data query
$sql = "SELECT {$selectFields}, ST_AsGeoJSON(geom, 6) AS geojson FROM {$layer}" . $parkFilter
    . " ORDER BY objectid LIMIT :limit OFFSET :offset";
$params[':limit'] = $limit;
$params[':offset'] = $offset;

$stmt = $db->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

// Build GeoJSON FeatureCollection
$features = [];
foreach ($rows as $row) {
    $geometry = json_decode($row['geojson'], true);
    $properties = [];
    foreach ($cols as $alias => $col) {
        $properties[$alias] = $row[$alias];
    }
    $features[] = [
        'type' => 'Feature',
        'geometry' => $geometry,
        'properties' => $properties,
    ];
}

jsonResponse([
    'type' => 'FeatureCollection',
    'total' => $total,
    'limit' => $limit,
    'offset' => $offset,
    'features' => $features,
]);
