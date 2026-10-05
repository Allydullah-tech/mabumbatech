<?php
/**
 * MABUMBA TECH — Minimal Excel writer (no external dependencies)
 *
 * No PhpSpreadsheet/vendor directory available here, so this writes the
 * "Excel 2003 XML Spreadsheet" (SpreadsheetML) format instead of a real
 * .xlsx — it's plain, human-readable XML (no ZIP archive needed) that Excel,
 * LibreOffice, and Google Sheets all open natively without a compatibility
 * warning. Supports multiple named sheets in a single file, which is handy
 * for a multi-section report (Requests, Staff, Customers... each as a tab).
 */
class SimpleExcel
{
    private array $sheets = [];

    /** $headerRow = ['Col A', 'Col B', ...]; $rows = [[v1, v2, ...], ...] */
    public function addSheet(string $name, array $headerRow, array $rows): void
    {
        $name = trim(substr(preg_replace('/[\\\\\/\?\*\[\]:]/', ' ', $name), 0, 31));
        if ($name === '') $name = 'Sheet';
        $this->sheets[$name] = ['header' => $headerRow, 'rows' => $rows];
    }

    private function cellXml($value): string
    {
        $isNumber = is_int($value) || is_float($value)
            || (is_string($value) && $value !== '' && preg_match('/^-?[0-9]+(\.[0-9]+)?$/', $value) && !preg_match('/^0[0-9]/', $value));
        $type = $isNumber ? 'Number' : 'String';
        return '<Cell><Data ss:Type="' . $type . '">' . htmlspecialchars((string)$value, ENT_QUOTES) . '</Data></Cell>';
    }

    public function output(): string
    {
        $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
        $xml .= "<?mso-application progid=\"Excel.Sheet\"?>\n";
        $xml .= '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' . "\n";
        $xml .= '<Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0D52B8" ss:Pattern="Solid"/></Style></Styles>' . "\n";

        foreach ($this->sheets as $name => $sheet) {
            $xml .= '<Worksheet ss:Name="' . htmlspecialchars($name, ENT_QUOTES) . "\"><Table>\n";
            $xml .= '<Row>';
            foreach ($sheet['header'] as $h) {
                $xml .= '<Cell ss:StyleID="Header"><Data ss:Type="String">' . htmlspecialchars((string)$h, ENT_QUOTES) . '</Data></Cell>';
            }
            $xml .= "</Row>\n";
            foreach ($sheet['rows'] as $row) {
                $xml .= '<Row>';
                foreach ($row as $val) $xml .= $this->cellXml($val);
                $xml .= "</Row>\n";
            }
            $xml .= "</Table></Worksheet>\n";
        }

        $xml .= '</Workbook>';
        return $xml;
    }
}

/**
 * Minimal Excel/CSV READER (no external dependencies) — used by the Inventory
 * "Import from Excel" feature. Supports:
 *   - .csv (plain comma-separated, via fgetcsv)
 *   - .xlsx (real OOXML spreadsheet) — read directly with ZipArchive +
 *     SimpleXML, since there's no PhpSpreadsheet/vendor directory here. Only
 *     the first worksheet is read, which matches the flat "import list"
 *     shape this feature asks for (Category / Description / Quantity / Amount).
 * Legacy binary .xls is NOT supported (that format isn't XML at all) — the
 * caller should ask the user to save as .xlsx or .csv instead.
 *
 * Returns a plain array of rows, each row itself a plain array of string
 * cell values in column order. The caller (inventory.php) treats row 0 as
 * the header and everything after as data — same convention as fgetcsv.
 */
function read_spreadsheet_rows(string $tmpPath, string $originalName): array
{
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

    if ($ext === 'csv') {
        return read_csv_rows($tmpPath);
    }
    if ($ext === 'xlsx') {
        return read_xlsx_rows($tmpPath);
    }
    throw new RuntimeException('Please upload a .xlsx or .csv file.');
}

function read_csv_rows(string $path): array
{
    $rows = [];
    $handle = fopen($path, 'r');
    if (!$handle) throw new RuntimeException('Could not read the uploaded file.');

    // Strip a UTF-8 BOM if present, so the first header cell doesn't come
    // back as "\xEF\xBB\xBFCategory" instead of "Category".
    $bom = fread($handle, 3);
    if ($bom !== "\xEF\xBB\xBF") rewind($handle);

    while (($row = fgetcsv($handle)) !== false) {
        $rows[] = array_map(fn($v) => trim((string)$v), $row);
    }
    fclose($handle);
    return $rows;
}

function read_xlsx_rows(string $path): array
{
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('.xlsx import needs the PHP Zip extension, which is not enabled on this server. Please upload a .csv file instead.');
    }

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        throw new RuntimeException('That file could not be opened. Please make sure it is a valid .xlsx file.');
    }

    // Shared strings: xlsx stores repeated text once and references it by
    // index from the sheet, instead of inlining the text in every cell.
    $sharedStrings = [];
    $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($sharedXml !== false) {
        $sx = @simplexml_load_string($sharedXml);
        if ($sx !== false) {
            foreach ($sx->si as $si) {
                // A shared string can be a single <t>, or several <r><t> "runs"
                // (e.g. mixed formatting within one cell) — concatenate either way.
                $text = isset($si->t) ? (string)$si->t : '';
                if ($text === '' && isset($si->r)) {
                    foreach ($si->r as $run) $text .= (string)$run->t;
                }
                $sharedStrings[] = $text;
            }
        }
    }

    $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
    $zip->close();
    if ($sheetXml === false) {
        throw new RuntimeException('Could not find a worksheet in that file.');
    }

    $sheet = @simplexml_load_string($sheetXml);
    if ($sheet === false) {
        throw new RuntimeException('That worksheet could not be read.');
    }

    $rows = [];
    foreach ($sheet->sheetData->row as $rowXml) {
        $row = [];
        $colIndex = 0;
        foreach ($rowXml->c as $cell) {
            // Cell refs like "C7" tell us the real column even when empty
            // cells are skipped in the XML — pad with blanks up to that column.
            $ref = (string)$cell['r'];
            preg_match('/^([A-Z]+)/', $ref, $m);
            $targetIndex = $ref !== '' ? xlsx_col_to_index($m[1] ?? '') : $colIndex;
            while ($colIndex < $targetIndex) { $row[] = ''; $colIndex++; }

            $type = (string)$cell['t'];
            $raw = isset($cell->v) ? (string)$cell->v : '';
            if ($type === 's') {
                $row[] = $sharedStrings[(int)$raw] ?? '';
            } elseif ($type === 'inlineStr') {
                $row[] = isset($cell->is->t) ? (string)$cell->is->t : '';
            } else {
                $row[] = $raw;
            }
            $colIndex++;
        }
        $rows[] = $row;
    }
    return $rows;
}

/** Spreadsheet column letters ("A", "B", ..., "Z", "AA", ...) to a 0-based index. */
function xlsx_col_to_index(string $letters): int
{
    $index = 0;
    foreach (str_split($letters) as $ch) {
        $index = $index * 26 + (ord($ch) - ord('A') + 1);
    }
    return $index - 1;
}
