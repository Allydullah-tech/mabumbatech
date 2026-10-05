<?php
/**
 * MABUMBA TECH — Minimal PDF writer (no external dependencies)
 *
 * There's no Composer/vendor directory in this project (typical of shared
 * PHP hosting), so a full library like TCPDF/mPDF isn't available. This
 * writes a plain, valid PDF by hand using the built-in Helvetica core font —
 * no embedding needed. It's intentionally simple: text lines and basic
 * tables with fixed column widths, automatic page breaks. That's enough for
 * a clean branded report; it's not a general-purpose PDF layout engine.
 *
 * Images: image() embeds a JPEG as-is (its compressed bytes are written
 * straight into a /DCTDecode XObject) so no GD/zlib/image-processing
 * extension is required on the server at all — only the core, always-available
 * getimagesize() is used, just to read the pixel dimensions.
 */
class SimplePdf
{
    public const PAGE_W = 595.28; // A4 in points
    public const PAGE_H = 841.89;
    private const MARGIN = 40;

    /** @var array<int, string[]> */
    private array $pages = [];
    private array $curLines = [];
    private float $y;
    private float $fontSize = 10;
    private ?string $footerText = null; // when set, every page gets a footer with "Page X of N"

    /** @var array<int, array{data:string, w:int, h:int, colorSpace:string}> keyed by XObject name, e.g. "Im1" */
    private array $images = [];

    // Standard Adobe core-font (Helvetica / Helvetica-Bold) glyph widths, in
    // 1/1000 em, for printable ASCII 32–126 — the published metrics every
    // PDF viewer already assumes for these built-in fonts. Real widths (not
    // a flat per-character average) are what make word-wrapping accurate
    // enough to justify text properly.
    private const WIDTHS_REGULAR = [
        278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
        1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
        333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
        556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
    ];
    private const WIDTHS_BOLD = [
        278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
        975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
        333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
        611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
    ];
    private const DEFAULT_CHAR_WIDTH = 556; // fallback for anything outside 32–126 (em dashes, curly quotes, etc.)

    // MABUMBA TECH brand blue (matches --blue-900/--blue-700/--blue-50 in the
    // website's own CSS), as 0–1 floats for the PDF "rg" fill-color operator —
    // used to give report headers/section titles the same professional blue
    // identity as the rest of the site, instead of plain black-on-white.
    public const BLUE_DARK = [0.024, 0.165, 0.388];  // #062a63 — header band background
    public const BLUE = [0.051, 0.322, 0.722];       // #0d52b8 — section headings, accents
    public const BLUE_TINT = [0.961, 0.976, 1.0];    // #f5f9ff — light table header fill
    public const WHITE = [1, 1, 1];
    public const BLACK = [0, 0, 0];
    public const GRAY = [0.357, 0.42, 0.522];        // #5b6b85 — muted meta text

    public function __construct()
    {
        $this->y = self::PAGE_H - self::MARGIN;
    }

    public function addPage(): void
    {
        $this->pages[] = $this->curLines;
        $this->curLines = [];
        $this->y = self::PAGE_H - self::MARGIN;
    }

    public function setFontSize(float $size): void { $this->fontSize = $size; }

    public function spacer(float $h = 8): void { $this->y -= $h; }

    /** A left-margin text line. Auto page-breaks if it would run off the bottom. */
    public function line(string $text, ?float $size = null, bool $bold = false, ?array $color = null): void
    {
        $size = $size ?? $this->fontSize;
        $this->ensureSpace($size + 6);
        $font = $bold ? '/F2' : '/F1';
        $this->emit(self::MARGIN, $font, $size, $text, 0.0, $color ?? self::BLACK);
        $this->y -= ($size + 6);
    }

    /** Same as line(), but horizontally centered on the page (used for the document header). */
    public function centerLine(string $text, ?float $size = null, bool $bold = false, ?array $color = null): void
    {
        $size = $size ?? $this->fontSize;
        $this->ensureSpace($size + 6);
        $font = $bold ? '/F2' : '/F1';
        $textWidth = $this->textWidthPt($text, $size, $bold);
        $x = max(self::MARGIN, (self::PAGE_W - $textWidth) / 2);
        $this->emit($x, $font, $size, $text, 0.0, $color ?? self::BLACK);
        $this->y -= ($size + 6);
    }

    /**
     * A filled rectangle — used for the blue header band behind the logo/title
     * and the light tint behind table header rows. Coordinates/size in points;
     * $y is measured from the current cursor position, same as everything else.
     */
    public function rect(float $x, float $y, float $w, float $h, array $color): void
    {
        [$r, $g, $b] = $color;
        $this->curLines[] = round($r, 3) . ' ' . round($g, 3) . ' ' . round($b, 3) . ' rg '
            . round($x, 2) . ' ' . round($y, 2) . ' ' . round($w, 2) . ' ' . round($h, 2) . ' re f';
    }

    /**
     * Embeds a PNG (e.g. the company logo, which has transparency) by
     * flattening it onto a white background and re-encoding as a JPEG in a
     * temp file, then handing off to the existing, already-tested image()
     * method — rather than hand-rolling PNG's own zlib/scanline-filter format
     * as a second PDF image path. Requires the GD extension (bundled on
     * virtually every PHP install); silently does nothing without it or if
     * the file can't be read, same philosophy as image() — a logo problem
     * should never break the whole report download.
     */
    public function imagePng(string $pngPath, float $displayWidthPt, ?float $displayHeightPt = null): void
    {
        if (!is_readable($pngPath) || !extension_loaded('gd')) return;
        $src = @imagecreatefrompng($pngPath);
        if (!$src) return;

        $w = imagesx($src);
        $h = imagesy($src);
        $flat = imagecreatetruecolor($w, $h);
        imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
        imagealphablending($flat, true);
        imagecopy($flat, $src, 0, 0, 0, 0, $w, $h);
        imagedestroy($src);

        $tmpPath = tempnam(sys_get_temp_dir(), 'mbt_pdf_img_') . '.jpg';
        imagejpeg($flat, $tmpPath, 92);
        imagedestroy($flat);

        $this->image($tmpPath, $displayWidthPt, $displayHeightPt);
        @unlink($tmpPath);
    }

    /**
     * Embeds a JPEG file, horizontally centered, scaled to $displayWidthPt wide
     * (height follows the image's own aspect ratio unless $displayHeightPt is
     * given). Silently does nothing if the file can't be read — a missing
     * logo asset should never break the whole PDF download.
     */
    public function image(string $path, float $displayWidthPt, ?float $displayHeightPt = null): void
    {
        if (!is_readable($path)) return;
        $data = file_get_contents($path);
        if ($data === false || $data === '') return;

        $info = @getimagesize($path);
        if ($info === false || (int)$info[0] <= 0 || (int)$info[1] <= 0) return;
        [$pxW, $pxH] = $info;

        $channels = $info['channels'] ?? 3;
        if ($channels === 1) {
            $colorSpace = '/DeviceGray';
        } elseif ($channels === 4) {
            $colorSpace = '/DeviceCMYK';
        } else {
            $colorSpace = '/DeviceRGB';
        }

        $displayHeightPt = $displayHeightPt ?? ($displayWidthPt * $pxH / $pxW);
        $this->ensureSpace($displayHeightPt + 6);

        $name = 'Im' . (count($this->images) + 1);
        $this->images[$name] = ['data' => $data, 'w' => $pxW, 'h' => $pxH, 'colorSpace' => $colorSpace];

        $x = max(self::MARGIN, (self::PAGE_W - $displayWidthPt) / 2);
        $yBottom = $this->y - $displayHeightPt;
        $this->curLines[] = 'q ' . round($displayWidthPt, 2) . ' 0 0 ' . round($displayHeightPt, 2) . ' '
            . round($x, 2) . ' ' . round($yBottom, 2) . ' cm /' . $name . ' Do Q';

        $this->y -= ($displayHeightPt + 6);
    }

    /**
     * A word-wrapped block of text, split into as many line() calls as needed
     * to fit within $widthPt (defaults to the full usable page width). Unlike
     * line(), this never truncates — long paragraphs (like Terms & Conditions
     * copy) simply flow onto additional lines/pages.
     *
     * By default every line except the last one of each paragraph is
     * justified (stretched with extra word-spacing so it's flush on both the
     * left and right, matching a typical printed/CV-style paragraph). Pass
     * $justify = false to keep the old ragged-right behaviour.
     */
    public function paragraph(string $text, ?float $size = null, ?float $widthPt = null, bool $justify = true): void
    {
        $size = $size ?? $this->fontSize;
        $widthPt = $widthPt ?? (self::PAGE_W - 2 * self::MARGIN);

        foreach (explode("\n", $text) as $paraLine) {
            $words = preg_split('/\s+/', trim($paraLine));
            if ($words === false || $words === ['']) continue;

            // Wrap using real glyph widths rather than a flat character count,
            // so a line only breaks once it would actually overflow $widthPt.
            $wrapped = [];
            $current = '';
            foreach ($words as $word) {
                $candidate = $current === '' ? $word : $current . ' ' . $word;
                if ($current !== '' && $this->textWidthPt($candidate, $size, false) > $widthPt) {
                    $wrapped[] = $current;
                    $current = $word;
                } else {
                    $current = $candidate;
                }
            }
            if ($current !== '') $wrapped[] = $current;

            $lastIndex = count($wrapped) - 1;
            foreach ($wrapped as $i => $lineText) {
                if ($justify && $i !== $lastIndex) {
                    $this->justifiedLine($lineText, $widthPt, $size);
                } else {
                    $this->line($lineText, $size);
                }
            }
        }
    }

    /**
     * Renders one line stretched to exactly fill $targetWidthPt by spreading
     * the shortfall evenly across the gaps between words (the PDF word-spacing
     * operator, Tw). Falls back to a normal ragged line if there's only one
     * word, or if the width estimate is off enough that stretching would look
     * broken (safety clamp) rather than risk illegible spacing.
     */
    private function justifiedLine(string $text, float $targetWidthPt, float $size): void
    {
        $words = preg_split('/\s+/', trim($text));
        $gaps = is_array($words) ? count($words) - 1 : 0;
        if ($gaps < 1) {
            $this->line($text, $size);
            return;
        }

        $natural = $this->textWidthPt($text, $size, false);
        $extraPerGap = ($targetWidthPt - $natural) / $gaps;

        if ($extraPerGap < -1 || $extraPerGap > $size * 2.5) {
            $this->line($text, $size);
            return;
        }

        $this->ensureSpace($size + 6);
        $this->emit(self::MARGIN, '/F1', $size, $text, max(0, $extraPerGap));
        $this->y -= ($size + 6);
    }

    /** Turns on a footer for every page: this text on the left and "Page X of N" on the right. */
    public function setFooter(string $text): void { $this->footerText = $text; }

    /** A blue section heading that is never left stranded at the very bottom of a page. */
    public function section(string $title): void
    {
        $this->ensureSpace(64);
        $this->spacer(6);
        $this->line($title, 12, true, self::BLUE);
    }

    /**
     * A row of signature boxes side by side — e.g. ['Prepared by', 'Approved by'].
     * Each box has a Name line, a Signature line and a Date line to write on.
     * The whole block is kept together on one page.
     */
    public function signatureBlock(array $titles): void
    {
        $this->ensureSpace(190);
        $this->spacer(16);
        $count = max(1, count($titles));
        $gap = 34;
        $usable = self::PAGE_W - 2 * self::MARGIN;
        $colW = ($usable - $gap * ($count - 1)) / $count;
        $top = $this->y;

        foreach (array_values($titles) as $i => $title) {
            $x = self::MARGIN + $i * ($colW + $gap);
            $this->emitAt($x, $top, '/F2', 10.5, $title, self::BLUE_DARK);
            foreach ([['Name', 46], ['Signature', 98], ['Date', 150]] as [$label, $offset]) {
                $lineY = $top - $offset;
                $this->emitAt($x, $lineY + 3, '/F1', 8.5, $label . ':', self::GRAY);
                $labelW = $this->textWidthPt($label . ':', 8.5, false) + 8;
                $this->curLines[] = 'q 0.55 0.6 0.68 RG 0.7 w ' . round($x + $labelW, 2) . ' ' . round($lineY, 2) . ' m '
                    . round($x + $colW, 2) . ' ' . round($lineY, 2) . ' l S Q';
            }
        }
        $this->y = $top - 170;
    }

    public function hr(): void
    {
        $this->ensureSpace(6);
        $this->curLines[] = round(self::MARGIN, 2) . ' ' . round($this->y + 3, 2) . ' m '
            . round(self::PAGE_W - self::MARGIN, 2) . ' ' . round($this->y + 3, 2) . ' l S';
        $this->y -= 4;
    }

    /**
     * A simple table. $cols = [[label, widthPt], ...] summing to <= usable width.
     * $rows = [[cellText, ...], ...] — cell text is truncated to fit its column.
     */
    public function table(array $cols, array $rows, float $size = 9): void
    {
        $this->ensureSpace($size + 14);
        $tableWidth = array_sum(array_map(fn($c) => $c[1], $cols));
        // Light blue tint band behind the header row — drawn first so the text
        // above it isn't covered; height matches this row's own text height.
        $this->rect(self::MARGIN, $this->y - $size - 6, $tableWidth, $size + 10, self::BLUE_TINT);

        $x = self::MARGIN;
        foreach ($cols as $c) {
            $this->emit($x, '/F2', $size, $this->fit($c[0], $c[1], $size), 0.0, self::BLUE_DARK);
            $x += $c[1];
        }
        $this->y -= ($size + 4);
        $this->y -= 8;

        foreach ($rows as $i => $row) {
            $this->ensureSpace($size + 6);
            // Faint alternating row tint — easier to scan a wide table, and a
            // small professional touch print reports are expected to have.
            if ($i % 2 === 1) $this->rect(self::MARGIN, $this->y - $size - 3, $tableWidth, $size + 6, self::BLUE_TINT);
            $x = self::MARGIN;
            foreach ($row as $j => $val) {
                $w = $cols[$j][1] ?? 100;
                $this->emit($x, '/F1', $size, $this->fit((string)$val, $w, $size));
                $x += $w;
            }
            $this->y -= ($size + 5);
        }
        $this->y -= 8;
    }

    /** Same as emit(), but at an explicit baseline $y instead of the running cursor. */
    private function emitAt(float $x, float $y, string $font, float $size, string $text, array $color = self::BLACK): void
    {
        [$r, $g, $b] = $color;
        $this->curLines[] = round($r, 3) . ' ' . round($g, 3) . ' ' . round($b, 3) . ' rg BT '
            . "$font $size Tf 0 Tw 1 0 0 1 " . round($x, 2) . ' ' . round($y, 2) . ' Tm (' . $this->esc($text) . ') Tj ET';
    }

    private function emit(float $x, string $font, float $size, string $text, float $wordSpacing = 0.0, array $color = self::BLACK): void
    {
        // wordSpacing is always stated explicitly (even when 0) because Tw is
        // part of the persistent text graphics state in PDF — it would
        // otherwise leak from a justified line into the next, unrelated one.
        // Same reasoning for color (rg): always set explicitly so one colored
        // heading can never bleed into the next, unrelated line.
        [$r, $g, $b] = $color;
        $this->curLines[] = round($r, 3) . ' ' . round($g, 3) . ' ' . round($b, 3) . ' rg BT '
            . "$font $size Tf " . round($wordSpacing, 3) . ' Tw 1 0 0 1 '
            . round($x, 2) . ' ' . round($this->y, 2) . ' Tm (' . $this->esc($text) . ') Tj ET';
    }

    /** Truncates $text with an ellipsis so it fits within $widthPt, using real glyph widths. */
    private function fit(string $text, float $widthPt, float $size): string
    {
        if ($this->textWidthPt($text, $size, false) <= $widthPt) return $text;
        $chars = mb_str_split($text);
        while (count($chars) > 0 && $this->textWidthPt(implode('', $chars) . '…', $size, false) > $widthPt) {
            array_pop($chars);
        }
        return implode('', $chars) . '…';
    }

    /** Sums real (Adobe core-font) glyph widths for $text at $size, in points. */
    private function textWidthPt(string $text, float $size, bool $bold): float
    {
        $total = 0;
        foreach (mb_str_split($text) as $ch) {
            $total += $this->charWidth($ch, $bold);
        }
        return $total * $size / 1000;
    }

    /** Width (1/1000 em) of a single character in Helvetica / Helvetica-Bold. */
    private function charWidth(string $ch, bool $bold): int
    {
        $code = mb_ord($ch);
        if ($code === false || $code < 32 || $code > 126) {
            return self::DEFAULT_CHAR_WIDTH;
        }
        $table = $bold ? self::WIDTHS_BOLD : self::WIDTHS_REGULAR;
        return $table[$code - 32];
    }

    private function ensureSpace(float $needed): void
    {
        if ($this->y - $needed < self::MARGIN) $this->addPage();
    }

    private function esc(string $s): string
    {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $s);
    }

    public function output(): string
    {
        $this->pages[] = $this->curLines;
        $this->curLines = [];

        if ($this->footerText !== null) {
            $total = count($this->pages);
            foreach ($this->pages as $i => $lines) {
                $this->curLines = [];
                $this->curLines[] = 'q 0.8 0.84 0.9 RG 0.6 w ' . self::MARGIN . ' 34 m ' . round(self::PAGE_W - self::MARGIN, 2) . ' 34 l S Q';
                $this->emitAt(self::MARGIN, 22, '/F1', 8, $this->footerText, self::GRAY);
                $pageLabel = 'Page ' . ($i + 1) . ' of ' . $total;
                $this->emitAt(self::PAGE_W - self::MARGIN - $this->textWidthPt($pageLabel, 8, false), 22, '/F1', 8, $pageLabel, self::GRAY);
                $this->pages[$i] = array_merge($lines, $this->curLines);
            }
            $this->curLines = [];
        }

        $objects = [];
        $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
        $objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

        $nextObj = 5;

        // Register image XObjects first so every page's /Resources can point at
        // them by object id (harmless if a given page doesn't actually use one).
        $imageObjIds = [];
        $xobjectDict = '';
        foreach ($this->images as $name => $img) {
            $id = $nextObj++;
            $imageObjIds[$name] = $id;
            $objects[$id] = '<< /Type /XObject /Subtype /Image /Width ' . $img['w'] . ' /Height ' . $img['h']
                . ' /ColorSpace ' . $img['colorSpace'] . ' /BitsPerComponent 8 /Filter /DCTDecode /Length '
                . strlen($img['data']) . " >>\nstream\n" . $img['data'] . "\nendstream";
            $xobjectDict .= '/' . $name . ' ' . $id . ' 0 R ';
        }
        $resources = '/Font << /F1 3 0 R /F2 4 0 R >>' . ($xobjectDict !== '' ? ' /XObject << ' . $xobjectDict . '>>' : '');

        $pageIds = [];
        foreach ($this->pages as $lines) {
            $contentId = $nextObj++;
            $pageId = $nextObj++;
            $stream = implode("\n", $lines);
            $objects[$contentId] = "<< /Length " . strlen($stream) . " >>\nstream\n$stream\nendstream";
            $objects[$pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' . self::PAGE_W . ' ' . self::PAGE_H . '] '
                . '/Resources << ' . $resources . ' >> /Contents ' . $contentId . ' 0 R >>';
            $pageIds[] = $pageId;
        }
        $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', array_map(fn($id) => "$id 0 R", $pageIds)) . '] /Count ' . count($pageIds) . ' >>';
        $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';

        ksort($objects);
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $num => $body) {
            $offsets[$num] = strlen($pdf);
            $pdf .= "$num 0 obj\n$body\nendobj\n";
        }
        $xrefStart = strlen($pdf);
        $maxObj = max(array_keys($objects));
        $pdf .= "xref\n0 " . ($maxObj + 1) . "\n0000000000 65535 f \n";
        for ($i = 1; $i <= $maxObj; $i++) {
            $pdf .= isset($offsets[$i])
                ? str_pad((string)$offsets[$i], 10, '0', STR_PAD_LEFT) . " 00000 n \n"
                : "0000000000 00000 f \n";
        }
        $pdf .= "trailer\n<< /Size " . ($maxObj + 1) . " /Root 1 0 R >>\nstartxref\n$xrefStart\n%%EOF";
        return $pdf;
    }
}
