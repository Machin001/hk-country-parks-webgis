<?php
/**
 * Get filter options: parks and districts (regions)
 *
 * GET /api/get_filter_data.php
 *
 * Returns:
 * {
 *   "parks": [{"name_en": "...", "name_tc": "..."}],
 *   "districts": [{"name_en": "...", "name_tc": "..."}],
 *   "park_district_map": {"Park Name": "District Name"}
 * }
 */
require_once __DIR__ . '/config.php';

$db = getDB();

// 1. Get all country park names
$stmt = $db->query("SELECT DISTINCT name_en, name_tc FROM country_parks ORDER BY name_en");
$parks = $stmt->fetchAll();

// 2. Get distinct regions from hiking_trails with Chinese names
$stmt = $db->query("SELECT DISTINCT region_en, region_ch FROM hiking_trails WHERE region_en IS NOT NULL AND region_en <> '' ORDER BY region_en");
$districts = $stmt->fetchAll();

// 3. Build park-to-district mapping using spatial proximity
$stmt = $db->query("
    SELECT DISTINCT cp.name_en AS park_en, ht.region_en AS region_en
    FROM hiking_trails ht
    JOIN country_parks cp ON ST_DWithin(ht.geom, cp.geom, 0.01)
    WHERE ht.region_en IS NOT NULL
    ORDER BY cp.name_en
");
$mappingRows = $stmt->fetchAll();

$parkDistrictMap = [];
foreach ($mappingRows as $row) {
    if (!isset($parkDistrictMap[$row['park_en']])) {
        $parkDistrictMap[$row['park_en']] = $row['region_en'];
    }
}

// Reformat districts to consistent structure
$districtList = [];
foreach ($districts as $d) {
    $districtList[] = [
        'name_en' => $d['region_en'],
        'name_tc' => $d['region_ch'] ?: $d['region_en'],
    ];
}

jsonResponse([
    'total_parks' => count($parks),
    'parks' => $parks,
    'total_districts' => count($districtList),
    'districts' => $districtList,
    'park_district_map' => $parkDistrictMap,
]);
