<?php
require_once __DIR__ . '/../../includes/api.php';
require_once __DIR__ . '/../../includes/terms_content.php';
require_once __DIR__ . '/../../includes/simple_pdf.php';

// Discard any stray buffered output before writing raw PDF bytes — same
// reasoning as the operations-report export: a stray warning here would
// corrupt the downloaded file.
if (ob_get_length() !== false) {
    ob_clean();
}

$pdf = new SimplePdf();

// Letterhead-style header: logo, brand-colored title block, then a thin
// accent rule to close it off before the Contents list — same brand blue
// used site-wide (SimplePdf::BLUE / BLUE_DARK), just applied here instead
// of plain black so the document reads as an official MABUMBA TECH letter
// rather than a plain text export.
// Full MABUMBA TECH logo (same one the reports use) — its dark lettering stays readable on the white page.
$pdf->imagePng(__DIR__ . '/../../../frontend/img/logo.png', 130); // height follows the logo's own aspect ratio
$pdf->spacer(8);
$pdf->centerLine('MABUMBA TECH', 19, true, SimplePdf::BLUE_DARK);
$pdf->centerLine('Terms & Conditions', 13, true, SimplePdf::BLUE);
$pdf->spacer(3);
$pdf->centerLine('Version ' . TERMS_VERSION . '  |  Last updated ' . terms_updated_label(), 9, false, SimplePdf::GRAY);
$pdf->spacer(10);
$pdf->hr();
$pdf->spacer(12);

// Table of contents — same section list (and order) as the "Contents" box
// rendered on the web page / modal by renderTermsSectionsHtml() in terms.js,
// so the downloaded PDF matches what people see online. Each title is short
// enough to always fit on one line, so entries never wrap mid-line.
$sections = terms_sections();
$pdf->line('Contents', 12, true);
$pdf->spacer(2);
foreach ($sections as $section) {
    if ($section['id'] === 'intro') continue;
    $pdf->line($section['title'], 10);
}
$pdf->spacer(10);

foreach ($sections as $section) {
    $pdf->line($section['title'], 11, true);
    $pdf->spacer(2);
    $pdf->paragraph($section['body'], 10);
    $pdf->spacer(8);
}

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="MABUMBA-TECH-Terms-and-Conditions.pdf"');
echo $pdf->output();
exit;
