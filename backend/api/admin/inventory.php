<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_permission('inventory.view');
$canManage = has_permission($me, 'inventory.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$canManage) json_error('You do not have permission to make changes here.', 403);
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    // ---- Categories: stored by the user, then offered in every product /
    // purchase / import dropdown. A category that still has products in it
    // cannot be deleted.
    if ($action === 'create_category' || $action === 'update_category') {
        $name = trim(preg_replace('/\s+/', ' ', $input['name'] ?? ''));
        $categoryId = (int)($input['category_id'] ?? 0);
        if ($name === '') json_response(['success' => false, 'message' => 'Please enter a category name.']);
        if (mb_strlen($name) > 100) json_response(['success' => false, 'message' => 'Category name is too long (100 characters maximum).']);
        $dup = $pdo->prepare('SELECT id FROM product_categories WHERE LOWER(name) = LOWER(?) AND id <> ?');
        $dup->execute([$name, $action === 'update_category' ? $categoryId : 0]);
        if ($dup->fetchColumn()) json_response(['success' => false, 'message' => 'A category named "' . $name . '" already exists.']);

        if ($action === 'create_category') {
            $pdo->prepare('INSERT INTO product_categories (name) VALUES (?)')->execute([$name]);
            log_activity($me['id'], 'Added product category', $name);
            json_response(['success' => true, 'message' => 'Category "' . $name . '" saved.']);
        }
        $exists = $pdo->prepare('SELECT 1 FROM product_categories WHERE id = ?');
        $exists->execute([$categoryId]);
        if (!$exists->fetchColumn()) json_response(['success' => false, 'message' => 'Category not found.']);
        $pdo->prepare('UPDATE product_categories SET name = ? WHERE id = ?')->execute([$name, $categoryId]);
        log_activity($me['id'], 'Renamed product category', $name);
        json_response(['success' => true, 'message' => 'Category updated.']);
    }

    if ($action === 'delete_category') {
        $categoryId = (int)($input['category_id'] ?? 0);
        $cnt = $pdo->prepare('SELECT COUNT(*) FROM products WHERE category_id = ? AND is_active = 1');
        $cnt->execute([$categoryId]);
        if ((int)$cnt->fetchColumn() > 0) {
            json_response(['success' => false, 'message' => 'This category still has products. Move or remove those products first.']);
        }
        $pdo->prepare('DELETE FROM product_categories WHERE id = ?')->execute([$categoryId]);
        log_activity($me['id'], 'Deleted product category', '#' . $categoryId);
        json_response(['success' => true, 'message' => 'Category deleted.']);
    }

    // ---- Delete a product. A product that was never used is erased for good.
    // One that already has stock history (purchases, sales, damages, stock
    // adjustments) is ARCHIVED instead: it disappears from every list and can no
    // longer be sold or restocked, but old receipts, purchases and finance /
    // report figures that point at it stay correct.
    if ($action === 'delete_product') {
        $productId = (int)($input['product_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT id, name FROM products WHERE id = ? AND is_active = 1');
        $stmt->execute([$productId]);
        $product = $stmt->fetch();
        if (!$product) json_response(['success' => false, 'message' => 'Product not found (it may already have been deleted).']);

        $hist = $pdo->prepare('
            SELECT
              (SELECT COUNT(*) FROM inventory_sales s JOIN product_types pt ON pt.id = s.product_type_id WHERE pt.product_id = ?) +
              (SELECT COUNT(*) FROM stock_movements sm JOIN product_types pt ON pt.id = sm.product_type_id WHERE pt.product_id = ?) +
              (SELECT COUNT(*) FROM purchase_items pi JOIN product_types pt ON pt.id = pi.product_type_id WHERE pt.product_id = ?)
        ');
        $hist->execute([$productId, $productId, $productId]);
        $hasHistory = (int)$hist->fetchColumn() > 0;

        $archive = function () use ($pdo, $productId) {
            $pdo->beginTransaction();
            try {
                $pdo->prepare('UPDATE product_types SET is_active = 0 WHERE product_id = ?')->execute([$productId]);
                $pdo->prepare('UPDATE products SET is_active = 0 WHERE id = ?')->execute([$productId]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
        };

        try {
            if ($hasHistory) {
                $archive();
                log_activity($me['id'], 'Deleted product (archived)', $product['name']);
                json_response(['success' => true, 'message' => '"' . $product['name'] . '" was deleted. It has sales/stock history, so it was archived — hidden everywhere, while old receipts and reports stay correct.']);
            }
            $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$productId]);   // its types are removed with it
            log_activity($me['id'], 'Deleted product', $product['name']);
            json_response(['success' => true, 'message' => '"' . $product['name'] . '" was deleted.']);
        } catch (PDOException $e) {
            // A database rule still protects it (e.g. a record we did not count) — archive instead of failing.
            try {
                $archive();
                log_activity($me['id'], 'Deleted product (archived)', $product['name']);
                json_response(['success' => true, 'message' => '"' . $product['name'] . '" was deleted (archived, because other records still refer to it).']);
            } catch (Throwable $e2) {
                json_response(['success' => false, 'message' => 'Could not delete this product: ' . $e2->getMessage()]);
            }
        }
    }

    if ($action === 'create_supplier') {
        $name = trim($input['name'] ?? '');
        $contactPerson = trim($input['contact_person'] ?? '');
        $phone = trim($input['phone'] ?? '');
        if ($name === '') json_response(['success' => false, 'message' => 'Supplier name is required.']);
        // Contact Person is a NAME (who to ask for); Phone is the NUMBER to call.
        if ($contactPerson !== '' && !preg_match('/\p{L}/u', $contactPerson)) {
            json_response(['success' => false, 'message' => 'Contact Person should be a name (e.g. Amina Juma). Put the phone number in the Phone field.']);
        }
        if ($phone !== '' && !preg_match('/^\+?[0-9][0-9\s\-()]{6,}$/', $phone)) {
            json_response(['success' => false, 'message' => 'Phone should be a number such as 0712 345 678 or +255 712 345 678.']);
        }
        $pdo->prepare('INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?,?,?,?,?)')
            ->execute([$name, $contactPerson ?: null, $phone ?: null, trim($input['email'] ?? '') ?: null, trim($input['address'] ?? '') ?: null]);
        json_response(['success' => true, 'message' => 'Supplier added.']);
    }

    if ($action === 'create_product') {
        $name = trim($input['name'] ?? '');
        $categoryId = (int)($input['category_id'] ?? 0);
        if ($name === '') json_response(['success' => false, 'message' => 'Product name is required.']);
        $stmt = $pdo->prepare('SELECT 1 FROM product_categories WHERE id = ?');
        $stmt->execute([$categoryId]);
        if (!$stmt->fetchColumn()) {
            json_response(['success' => false, 'message' => 'Please choose a category. If the list is empty, add one first in the Categories tab.']);
        }
        $stmt = $pdo->prepare('INSERT INTO products (category_id, name, description, created_by) VALUES (?,?,?,?)');
        $stmt->execute([$categoryId, $name, trim($input['description'] ?? '') ?: null, $me['id']]);
        log_activity($me['id'], 'Created product', $name);
        json_response(['success' => true, 'message' => 'Product created.', 'product_id' => (int)$pdo->lastInsertId()]);
    }

    if ($action === 'update_product') {
        $productId = (int)($input['product_id'] ?? 0);
        $name = trim($input['name'] ?? '');
        $categoryId = (int)($input['category_id'] ?? 0);
        if ($name === '') json_response(['success' => false, 'message' => 'Product name is required.']);
        $stmt = $pdo->prepare('SELECT name FROM products WHERE id = ? AND is_active = 1');
        $stmt->execute([$productId]);
        $oldName = $stmt->fetchColumn();
        if ($oldName === false) json_response(['success' => false, 'message' => 'Product not found.']);
        $stmt = $pdo->prepare('SELECT 1 FROM product_categories WHERE id = ?');
        $stmt->execute([$categoryId]);
        if (!$stmt->fetchColumn()) json_response(['success' => false, 'message' => 'Please choose a category.']);
        $stmt = $pdo->prepare('SELECT 1 FROM products WHERE category_id = ? AND LOWER(name) = LOWER(?) AND is_active = 1 AND id <> ?');
        $stmt->execute([$categoryId, $name, $productId]);
        if ($stmt->fetchColumn()) json_response(['success' => false, 'message' => 'Another product with this name already exists in that category.']);
        $pdo->prepare('UPDATE products SET name = ?, category_id = ?, description = ? WHERE id = ?')
            ->execute([$name, $categoryId, trim($input['description'] ?? '') ?: null, $productId]);
        log_activity($me['id'], 'Edited product', $oldName === $name ? $name : $oldName . ' -> ' . $name);
        json_response(['success' => true, 'message' => 'Product updated.']);
    }

    if ($action === 'create_product_type') {
        $productId = (int)($input['product_id'] ?? 0);
        $name = trim($input['name'] ?? '');
        $sellingPrice = (float)($input['selling_price'] ?? 0);
        if (!$productId || $name === '' || $sellingPrice <= 0) {
            json_response(['success' => false, 'message' => 'Product, type name, and a valid selling price are required.']);
        }
        $stmt = $pdo->prepare('
            INSERT INTO product_types (product_id, name, unit, buying_price, selling_price, minimum_selling_price, minimum_stock_level)
            VALUES (?,?,?,?,?,?,?)
        ');
        $stmt->execute([
            $productId, $name, trim($input['unit'] ?? '') ?: 'pcs',
            (float)($input['buying_price'] ?? 0), $sellingPrice,
            $input['minimum_selling_price'] !== '' ? (float)($input['minimum_selling_price'] ?? 0) : null,
            (int)($input['minimum_stock_level'] ?? 0),
        ]);
        json_response(['success' => true, 'message' => 'Type added.']);
    }

    if ($action === 'record_purchase') {
        $items = json_decode($input['items'] ?? '[]', true) ?: [];
        if (empty($items)) json_response(['success' => false, 'message' => 'Add at least one line item.']);
        try {
            $purchaseId = record_purchase(
                (int)($input['supplier_id'] ?? 0) ?: null,
                trim($input['purchase_date'] ?? '') ?: date('Y-m-d'),
                $items,
                trim($input['notes'] ?? '') ?: null,
                $me['id']
            );
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => 'Could not record purchase: ' . $e->getMessage()]);
        }
        log_activity($me['id'], 'Recorded purchase', "Purchase #$purchaseId");
        json_response(['success' => true, 'message' => 'Purchase recorded and stock updated.']);
    }

    if ($action === 'record_damage' || $action === 'adjust_stock') {
        $productTypeId = (int)($input['product_type_id'] ?? 0);
        $qty = (int)($input['quantity'] ?? 0);
        $notes = trim($input['notes'] ?? '') ?: null;
        if (!$productTypeId || $qty <= 0) json_response(['success' => false, 'message' => 'Choose a product type and a valid quantity.']);
        if ($action === 'record_damage' && ($notes === null || mb_strlen($notes) < 3)) {
            json_response(['success' => false, 'message' => 'Please add a remark explaining what happened to the damaged item.']);
        }

        if ($action === 'record_damage') {
            // Takes the stock out AND posts its cost to the finance ledger as a
            // loss (expense) — see record_damage() in includes/inventory.php.
            try {
                $result = record_damage($productTypeId, $qty, $notes, $me['id']);
            } catch (Throwable $e) {
                json_response(['success' => false, 'message' => $e->getMessage()]);
            }
            log_activity($me['id'], 'Recorded damage', "Type #$productTypeId: $qty (loss " . $result['loss'] . ')');
            $msg = 'Damage recorded.';
            if ($result['loss'] > 0) $msg .= ' ' . number_format($result['loss'], 2) . ' has been counted as a loss.';
            json_response(['success' => true, 'message' => $msg]);
        }

        $direction = ($input['direction'] ?? 'in') === 'out' ? 'out' : 'in';
        record_stock_movement($productTypeId, $direction === 'in' ? 'adjustment_in' : 'adjustment_out', $direction, $qty, 'manual', null, $notes, $me['id']);
        log_activity($me['id'], 'Stock adjustment', "Type #$productTypeId: $qty");
        json_response(['success' => true, 'message' => 'Stock updated.']);
    }

    if ($action === 'import_preview') {
        if (empty($_FILES['excel_file']['name'])) {
            json_response(['success' => false, 'message' => 'Please choose a file to import.']);
        }
        $file = $_FILES['excel_file'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            json_response(['success' => false, 'message' => 'Upload failed. Please try again.']);
        }
        if ($file['size'] > MAX_ATTACHMENT_BYTES) {
            json_response(['success' => false, 'message' => 'That file is larger than the 10MB limit.']);
        }
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['xlsx', 'csv'], true)) {
            json_response(['success' => false, 'message' => 'Please upload a .xlsx or .csv file.']);
        }

        require_once __DIR__ . '/../../includes/simple_excel.php';
        try {
            $rawRows = read_spreadsheet_rows($file['tmp_name'], $file['name']);
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => $e->getMessage()]);
        }
        // First non-empty row is treated as the header and skipped; everything
        // after is data. Column order: Category, Description/Variant, Quantity, Amount.
        $dataRows = array_values(array_filter($rawRows, fn($r) => implode('', $r) !== ''));
        array_shift($dataRows);

        $categoryNames = array_column($pdo->query('SELECT id, name FROM product_categories')->fetchAll(), 'name', 'id');

        $preview = [];
        foreach ($dataRows as $row) {
            $category = trim($row[0] ?? '');
            $description = trim($row[1] ?? '');
            $quantity = trim($row[2] ?? '');
            $amount = trim($row[3] ?? '');

            $matchedCategory = null;
            foreach ($categoryNames as $catName) {
                if (strcasecmp($catName, $category) === 0) { $matchedCategory = $catName; break; }
            }

            $error = null;
            if ($description === '') $error = 'Missing description.';
            elseif (!is_numeric($quantity) || (float)$quantity < 0) $error = 'Quantity must be a number.';
            elseif (!is_numeric($amount) || (float)$amount < 0) $error = 'Amount must be a number.';
            elseif (!$matchedCategory) $error = 'Category does not match any saved category — please select one.';

            $preview[] = [
                'category' => $matchedCategory, // null if it didn't match — user picks one in the preview UI
                'category_from_file' => $category,
                'description' => $description,
                'quantity' => is_numeric($quantity) ? (int)$quantity : 0,
                'amount' => is_numeric($amount) ? (float)$amount : 0,
                'selling_price' => null, // the user fills this in during preview
                'reorder_level' => 5,
                'error' => $error,
            ];
        }

        json_response(['success' => true, 'categories' => array_values($categoryNames), 'rows' => $preview]);
    }

    if ($action === 'import_confirm') {
        $rows = json_decode($input['rows'] ?? '[]', true) ?: [];
        if (empty($rows)) json_response(['success' => false, 'message' => 'No rows to import.']);

        $categoryIds = array_column($pdo->query('SELECT id, name FROM product_categories')->fetchAll(), 'id', 'name');

        $items = [];
        $skipped = 0;
        foreach ($rows as $row) {
            $categoryName = trim($row['category'] ?? '');
            $description = trim($row['description'] ?? '');
            $quantity = (int)($row['quantity'] ?? 0);
            $amount = (float)($row['amount'] ?? 0);
            $sellingPrice = (float)($row['selling_price'] ?? 0);
            $reorderLevel = (int)($row['reorder_level'] ?? 5);

            if (!isset($categoryIds[$categoryName]) || $description === '' || $quantity <= 0 || $sellingPrice <= 0) {
                $skipped++;
                continue;
            }

            $typeId = resolve_import_product_type((int)$categoryIds[$categoryName], $description, $amount, $sellingPrice, $reorderLevel, $me['id']);
            $items[] = ['product_type_id' => $typeId, 'quantity' => $quantity, 'unit_cost' => $amount];
        }

        if (empty($items)) {
            json_response(['success' => false, 'message' => 'No valid rows to import. Please fix the highlighted rows and try again.']);
        }

        try {
            $purchaseId = record_purchase(null, date('Y-m-d'), $items, 'Imported from Excel', $me['id']);
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => 'Import failed: ' . $e->getMessage()]);
        }
        log_activity($me['id'], 'Imported inventory from Excel', count($items) . ' item(s), Purchase #' . $purchaseId);

        $message = count($items) . ' item(s) imported successfully.';
        if ($skipped) $message .= " {$skipped} row(s) were skipped due to errors.";
        json_response(['success' => true, 'message' => $message]);
    }

    json_error('Unknown action.');
}

// ---- GET ----

$productView = (int)($_GET['product'] ?? 0);
if ($productView) {
    $product = $pdo->prepare('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN product_categories c ON c.id = p.category_id WHERE p.id = ?');
    $product->execute([$productView]);
    $product = $product->fetch();
    if (!$product) json_error('Product not found.', 404);

    $types = $pdo->prepare('SELECT * FROM product_types WHERE product_id = ? ORDER BY name');
    $types->execute([$productView]);

    json_response(['product' => $product, 'types' => $types->fetchAll(), 'can_manage' => $canManage]);
}

$typeMovements = (int)($_GET['type_movements'] ?? 0);
if ($typeMovements) {
    $stmt = $pdo->prepare('SELECT sm.*, u.full_name AS recorded_by_name FROM stock_movements sm
        LEFT JOIN users u ON u.id = sm.recorded_by WHERE sm.product_type_id = ? ORDER BY sm.created_at DESC LIMIT 100');
    $stmt->execute([$typeMovements]);
    json_response(['movements' => $stmt->fetchAll()]);
}

$products = product_summary();

$stats = $pdo->query("
    SELECT
        (SELECT COUNT(*) FROM products WHERE is_active = 1) AS total_products,
        (SELECT COALESCE(SUM(quantity),0) FROM product_types WHERE is_active = 1) AS total_stock,
        (SELECT COALESCE(SUM(quantity * buying_price),0) FROM product_types WHERE is_active = 1) AS stock_value,
        (SELECT COUNT(*) FROM product_types WHERE is_active = 1 AND quantity <= minimum_stock_level AND quantity > 0) AS low_stock_count,
        (SELECT COUNT(*) FROM product_types WHERE is_active = 1 AND quantity = 0) AS out_of_stock_count
")->fetch();

$damageTotals = damage_totals();
$stats['damaged_units'] = $damageTotals['units'];
$stats['damage_loss'] = $damageTotals['loss'];

$lowStockTypes = $pdo->query("
    SELECT pt.id, pt.name, pt.quantity, pt.minimum_stock_level, p.name AS product_name
    FROM product_types pt JOIN products p ON p.id = pt.product_id
    WHERE pt.is_active = 1 AND pt.quantity <= pt.minimum_stock_level
    ORDER BY pt.quantity ASC LIMIT 20
")->fetchAll();

$recentPurchases = $pdo->query("
    SELECT pu.*, s.name AS supplier_name, u.full_name AS recorded_by_name
    FROM purchases pu LEFT JOIN suppliers s ON s.id = pu.supplier_id LEFT JOIN users u ON u.id = pu.recorded_by
    ORDER BY pu.created_at DESC LIMIT 20
")->fetchAll();

$recentMovements = $pdo->query("
    SELECT sm.*, pt.name AS type_name, u.full_name AS recorded_by_name
    FROM stock_movements sm JOIN product_types pt ON pt.id = sm.product_type_id LEFT JOIN users u ON u.id = sm.recorded_by
    ORDER BY sm.created_at DESC LIMIT 30
")->fetchAll();

// Every damaged item, newest first, with the loss it cost (quantity x the
// buying price the item currently has on record).
$damages = $pdo->query("
    SELECT sm.id, sm.quantity, sm.notes, sm.created_at, pt.name AS type_name, p.name AS product_name,
           ROUND(sm.quantity * pt.buying_price, 2) AS loss, u.full_name AS recorded_by_name
    FROM stock_movements sm
    JOIN product_types pt ON pt.id = sm.product_type_id
    JOIN products p ON p.id = pt.product_id
    LEFT JOIN users u ON u.id = sm.recorded_by
    WHERE sm.movement_type = 'damage'
    ORDER BY sm.created_at DESC, sm.id DESC LIMIT 100
")->fetchAll();

$categories = $pdo->query('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count FROM product_categories c ORDER BY c.name')->fetchAll();
$suppliers = $pdo->query('SELECT * FROM suppliers ORDER BY name')->fetchAll();
$allTypes = $pdo->query("
    SELECT pt.id, pt.name, pt.quantity, pt.unit, pt.buying_price, p.name AS product_name, pc.name AS category_name
    FROM product_types pt JOIN products p ON p.id = pt.product_id LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE pt.is_active = 1 ORDER BY p.name, pt.name
")->fetchAll();

json_response([
    'stats' => $stats,
    'products' => $products,
    'low_stock' => $lowStockTypes,
    'recent_purchases' => $recentPurchases,
    'recent_movements' => $recentMovements,
    'damages' => $damages,
    'categories' => $categories,
    'suppliers' => $suppliers,
    'all_types' => $allTypes,
    'can_manage' => $canManage,
]);
