<?php
/**
 * Get all unique country park names (for filter dropdown)
 *
 * GET /api/get_parks.php
 */
require_once __DIR__ . '/config.php';

$db = getDB();

// Get park names from country_parks table
$stmt = $db->query("SELECT DISTINCT name_en, name_tc FROM country_parks ORDER BY name_en");
$parks = $stmt->fetchAll();

jsonResponse([
    'total' => count($parks),
    'parks' => $parks,
]);
