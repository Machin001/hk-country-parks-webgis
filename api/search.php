<?php
/**
 * Search facilities by keyword across all layers
 *
 * GET /api/search.php?q=dragon&layer=campsites
 */
require_once __DIR__ . '/config.php';

$q = isset($_GET['q']) ? trim($_GET['q']) : '';
$layer = isset($_GET['layer']) ? trim($_GET['layer']) : '';
$limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 100) : 20;

if ($q === '') {
    jsonResponse(['error' => 'Query parameter "q" is required'], 400);
}

$db = getDB();

$queries = [];

if ($layer === '' || $layer === 'country_parks') {
    $queries[] = [
        'layer' => 'country_parks',
        'sql' => "SELECT objectid AS id, name_en AS name, name_tc AS name_tc, NULL AS detail
                  FROM country_parks WHERE name_en ILIKE :q OR name_tc ILIKE :q ORDER BY objectid LIMIT :limit",
    ];
}
if ($layer === '' || $layer === 'hiking_trails') {
    $queries[] = [
        'layer' => 'hiking_trails',
        'sql' => "SELECT objectid AS id, trail_name_en AS name, trail_name_ch AS name_tc,
                  type_en || ' | ' || difficult_en AS detail
                  FROM hiking_trails WHERE trail_name_en ILIKE :q OR trail_name_ch ILIKE :q ORDER BY objectid LIMIT :limit",
    ];
}
if ($layer === '' || $layer === 'visitor_centres') {
    $queries[] = [
        'layer' => 'visitor_centres',
        'sql' => "SELECT objectid AS id, facility_name_en AS name, facility_name_tc AS name_tc,
                  country_park_en AS detail
                  FROM visitor_centres WHERE facility_name_en ILIKE :q OR facility_name_tc ILIKE :q ORDER BY objectid LIMIT :limit",
    ];
}
if ($layer === '' || $layer === 'campsites') {
    $queries[] = [
        'layer' => 'campsites',
        'sql' => "SELECT objectid AS id, facility_name_en AS name, facility_name_tc AS name_tc,
                  country_park_en AS detail
                  FROM campsites WHERE facility_name_en ILIKE :q OR facility_name_tc ILIKE :q ORDER BY objectid LIMIT :limit",
    ];
}

$results = [];
$searchTerm = '%' . $q . '%';

foreach ($queries as $queryInfo) {
    $stmt = $db->prepare($queryInfo['sql']);
    $stmt->execute([':q' => $searchTerm, ':limit' => $limit]);
    $rows = $stmt->fetchAll();
    foreach ($rows as $row) {
        $results[] = [
            'layer' => $queryInfo['layer'],
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'name_tc' => $row['name_tc'],
            'detail' => $row['detail'],
        ];
    }
}

jsonResponse([
    'query' => $q,
    'count' => count($results),
    'results' => $results,
]);
