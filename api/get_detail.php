<?php
/**
 * Get detailed information for a single feature
 *
 * GET /api/get_detail.php?layer=campsites&id=5
 */
require_once __DIR__ . '/config.php';

$allowedLayers = ['country_parks', 'hiking_trails', 'visitor_centres', 'campsites'];
$layer = isset($_GET['layer']) ? $_GET['layer'] : '';
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$layer || !in_array($layer, $allowedLayers)) {
    jsonResponse(['error' => 'Invalid layer'], 400);
}
if ($id <= 0) {
    jsonResponse(['error' => 'Valid ID is required'], 400);
}

$db = getDB();

$stmt = $db->prepare("SELECT *, ST_AsGeoJSON(geom, 6) AS geojson FROM {$layer} WHERE objectid = :id");
$stmt->execute([':id' => $id]);
$row = $stmt->fetch();

if (!$row) {
    jsonResponse(['error' => 'Feature not found'], 404);
}

// Remove geom (binary) and objectid from properties, keep rest
$geometry = json_decode($row['geojson'], true);
unset($row['geom']);
unset($row['geojson']);

jsonResponse([
    'type' => 'Feature',
    'layer' => $layer,
    'id' => $id,
    'geometry' => $geometry,
    'properties' => $row,
]);
