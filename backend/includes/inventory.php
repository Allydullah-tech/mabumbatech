<?php
/**
 * MABUMBA TECH — Inventory core logic
 * Schema: migration_016_inventory.sql
 */

function generate_purchase_code(): string
{
    global $pdo;
    do {
        $code = 'PO-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        $stmt = $pdo->prepare('SELECT 1 FROM purchases WHERE purchase_code = ?');
        $stmt->execute([$code]);
    } while ($stmt->fetchColumn());
    return $code;
}

/**
 * The ONLY function allowed to change product_types.quantity. Every stock
 * change — purchase received, damage, manual adjustment — is a row here,
 * with the quantity update happening in the same call so the two can never
 * go out of sync. $direction is 'in' or 'out'.
 */
function record_stock_movement(int $productTypeId, string $movementType, string $direction, int $quantity, ?string $referenceType, ?int $referenceId, ?string $notes, ?int $recordedBy): int
{
    global $pdo;
    if ($quantity <= 0) return 0;

    $stmt = $pdo->prepare('INSERT INTO stock_movements (product_type_id, movement_type, quantity, reference_type, reference_id, notes, recorded_by) VALUES (?,?,?,?,?,?,?)');
    $stmt->execute([$productTypeId, $movementType, $quantity, $referenceType, $referenceId, $notes, $recordedBy]);
    $movementId = (int)$pdo->lastInsertId();

    $op = $direction === 'in' ? '+' : '-';
    $pdo->prepare("UPDATE product_types SET quantity = GREATEST(0, quantity $op ?) WHERE id = ?")->execute([$quantity, $productTypeId]);

    return $movementId;
}

/**
 * Records damaged stock: takes it out of quantity (stock movement) AND posts
 * its cost (quantity x buying price) to the finance ledger as an EXPENSE in
 * category 'inventory_damage'. That single ledger row is what makes a damage
 * count as a loss everywhere expenses are counted — Finance, Reports and net
 * profit — with no second calculation to keep in sync. Both happen in one
 * transaction so stock and the loss can never disagree.
 *
 * Returns ['movement_id' => ..., 'loss' => float].
 */
function record_damage(int $productTypeId, int $quantity, ?string $notes, ?int $recordedBy): array
{
    global $pdo;
    if ($quantity <= 0) throw new RuntimeException('Enter a valid quantity.');

    $stmt = $pdo->prepare('SELECT pt.*, p.name AS product_name FROM product_types pt JOIN products p ON p.id = pt.product_id WHERE pt.id = ?');
    $stmt->execute([$productTypeId]);
    $type = $stmt->fetch();
    if (!$type) throw new RuntimeException('Product not found.');
    if ($quantity > (int)$type['quantity']) {
        throw new RuntimeException('Only ' . $type['quantity'] . ' ' . $type['unit'] . ' in stock — you cannot record more damaged than that.');
    }

    $loss = round($quantity * (float)$type['buying_price'], 2);

    $pdo->beginTransaction();
    try {
        $movementId = record_stock_movement($productTypeId, 'damage', 'out', $quantity, 'manual', null, $notes, $recordedBy);
        if ($loss > 0) {
            $desc = 'Damaged stock #DMG' . $movementId . ': ' . $type['product_name'] . ' - ' . $type['name'] . " (x{$quantity})";
            if ($notes) $desc .= ' — ' . $notes;
            record_transaction('expense', 'inventory_damage', $loss, date('Y-m-d'), mb_substr($desc, 0, 255), null, null, null, null, $recordedBy);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return ['movement_id' => $movementId, 'loss' => $loss];
}

/** Totals for the Inventory "Damaged" card: units written off and their cost. */
function damage_totals(): array
{
    global $pdo;
    $units = (int)$pdo->query("SELECT COALESCE(SUM(quantity),0) FROM stock_movements WHERE movement_type = 'damage'")->fetchColumn();
    $loss = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM finance_transactions WHERE type = 'expense' AND category = 'inventory_damage'")->fetchColumn();
    return ['units' => $units, 'loss' => $loss];
}

/** Records a purchase (one or more product types from one supplier) and stocks everything in, atomically. */
function record_purchase(?int $supplierId, string $date, array $items, ?string $notes, ?int $recordedBy): int
{
    global $pdo;
    $pdo->beginTransaction();
    try {
        $code = generate_purchase_code();
        $total = 0;
        foreach ($items as $item) {
            $total += (float)$item['quantity'] * (float)$item['unit_cost'];
        }
        $stmt = $pdo->prepare('INSERT INTO purchases (purchase_code, supplier_id, purchase_date, total_amount, notes, recorded_by) VALUES (?,?,?,?,?,?)');
        $stmt->execute([$code, $supplierId, $date, $total, $notes, $recordedBy]);
        $purchaseId = (int)$pdo->lastInsertId();

        foreach ($items as $item) {
            $productTypeId = (int)$item['product_type_id'];
            $qty = (int)$item['quantity'];
            $unitCost = (float)$item['unit_cost'];
            if ($qty <= 0) continue;

            $pdo->prepare('INSERT INTO purchase_items (purchase_id, product_type_id, quantity, unit_cost, line_total) VALUES (?,?,?,?,?)')
                ->execute([$purchaseId, $productTypeId, $qty, $unitCost, $qty * $unitCost]);

            record_stock_movement($productTypeId, 'purchase', 'in', $qty, 'purchase', $purchaseId, null, $recordedBy);
        }

        $pdo->commit();
        return $purchaseId;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * Find-or-create the product + variant (product_type) for one confirmed
 * Excel-import row, and return its product_type_id. Re-importing the same
 * item (same category + name) updates its prices and adds to its existing
 * stock instead of creating a duplicate — actual stock is still only ever
 * changed via record_purchase()/record_stock_movement(), never here.
 */
function resolve_import_product_type(int $categoryId, string $name, float $costPrice, float $sellingPrice, int $reorderLevel, int $createdBy): int
{
    global $pdo;

    $stmt = $pdo->prepare('SELECT id FROM products WHERE category_id = ? AND LOWER(name) = LOWER(?) AND is_active = 1 LIMIT 1');
    $stmt->execute([$categoryId, $name]);
    $productId = $stmt->fetchColumn();

    if (!$productId) {
        $stmt = $pdo->prepare('INSERT INTO products (category_id, name, created_by) VALUES (?,?,?)');
        $stmt->execute([$categoryId, $name, $createdBy]);
        $productId = (int)$pdo->lastInsertId();
    }

    $stmt = $pdo->prepare('SELECT id FROM product_types WHERE product_id = ? AND LOWER(name) = LOWER(?) LIMIT 1');
    $stmt->execute([$productId, $name]);
    $typeId = $stmt->fetchColumn();

    if ($typeId) {
        $pdo->prepare('UPDATE product_types SET buying_price = ?, selling_price = ?, minimum_stock_level = ? WHERE id = ?')
            ->execute([$costPrice, $sellingPrice, $reorderLevel, $typeId]);
        return (int)$typeId;
    }

    $stmt = $pdo->prepare('INSERT INTO product_types (product_id, name, unit, buying_price, selling_price, minimum_stock_level) VALUES (?,?,?,?,?,?)');
    $stmt->execute([$productId, $name, 'pcs', $costPrice, $sellingPrice, $reorderLevel]);
    return (int)$pdo->lastInsertId();
}

function generate_sale_code(): string
{
    global $pdo;
    do {
        $code = 'SL-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        $stmt = $pdo->prepare('SELECT 1 FROM inventory_sales WHERE sale_code = ?');
        $stmt->execute([$code]);
    } while ($stmt->fetchColumn());
    return $code;
}

/**
 * The lowest unit price this product may be sold at. Uses the product's own
 * minimum_selling_price when one is set; otherwise falls back to its buying
 * price so nothing can be sold below cost by accident.
 */
function sale_floor_price(array $type): float
{
    $min = $type['minimum_selling_price'] ?? null;
    if ($min !== null && (float)$min > 0) return (float)$min;
    return (float)$type['buying_price'];
}

/**
 * Records ONE sale that contains one or more products (a "receipt").
 * $items = [['product_type_id' => int, 'quantity' => int, 'unit_price' => float|null], ...]
 * unit_price is optional — when omitted the standard selling price is used.
 * A custom unit_price is allowed but can never be below the product's
 * minimum allowed selling price (server-side check, not just the form).
 *
 * Everything is atomic: every line is validated first (stock, minimum
 * price), then each line is stocked out through record_stock_movement() —
 * the only function allowed to touch product_types.quantity — and logged
 * with its own cost/profit snapshot. The receipt's revenue is posted to the
 * finance ledger as a single income entry, so Accountant totals include it
 * with nothing separate to keep in sync.
 *
 * $requestId (optional) ties the sale to the customer-acquisition PRODUCT
 * request it closes (see record_product_request_sale()); a normal over-the-
 * counter sale leaves it NULL.
 */
function record_sale_items(array $items, ?string $notes, ?int $soldBy, string $paymentMethod = 'cash', ?string $paymentChannel = null, ?array $credit = null, ?int $requestId = null): array
{
    global $pdo;
    if (empty($items)) throw new RuntimeException('Add at least one product to the sale.');

    // Payment: Mobile Money / Bank must name the provider; 'credit' means the
    // customer takes the goods now and pays later (see includes/debts.php).
    $isCredit = ($paymentMethod === 'credit');
    if ($isCredit) {
        $paymentChannel = null;
        $credit = $credit ?? [];
        $credit['name'] = trim((string)($credit['name'] ?? ''));
        $credit['phone'] = trim((string)($credit['phone'] ?? ''));
        $credit['address'] = trim((string)($credit['address'] ?? ''));
        $credit['due_date'] = trim((string)($credit['due_date'] ?? ''));
        $credit['deposit'] = round((float)($credit['deposit'] ?? 0), 2);
        $credit['deposit_method'] = (string)($credit['deposit_method'] ?? 'cash');
        $credit['deposit_channel'] = (string)($credit['deposit_channel'] ?? '');
        if ($credit['name'] === '') throw new RuntimeException('Enter the customer\'s name for a credit sale.');
        if (mb_strlen($credit['phone']) < 6) throw new RuntimeException('Enter the customer\'s phone number for a credit sale.');
        if ($credit['due_date'] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $credit['due_date'])) throw new RuntimeException('The due date is not valid.');
        if ($credit['due_date'] !== '' && $credit['due_date'] < date('Y-m-d')) throw new RuntimeException('The due date cannot be in the past.');
        if ($credit['deposit'] < 0) throw new RuntimeException('The amount paid now cannot be negative.');
        if ($credit['deposit'] > 0) {
            if (!in_array($credit['deposit_method'], PAYING_METHODS, true)) throw new RuntimeException('Choose how the customer is paying now.');
            $credit['deposit_channel'] = validate_payment_channel($credit['deposit_method'], $credit['deposit_channel']);
        }
    } else {
        $paymentChannel = validate_payment_channel($paymentMethod, $paymentChannel);
    }

    // Merge repeated lines of the same product+price so stock is checked on the real total.
    $lines = [];
    foreach ($items as $it) {
        $typeId = (int)($it['product_type_id'] ?? 0);
        $qty = (int)($it['quantity'] ?? 0);
        if (!$typeId || $qty <= 0) throw new RuntimeException('Every product needs a quantity of at least 1.');
        $price = isset($it['unit_price']) && $it['unit_price'] !== '' && $it['unit_price'] !== null ? round((float)$it['unit_price'], 2) : null;
        $key = $typeId . '|' . ($price === null ? 'std' : number_format($price, 2, '.', ''));
        if (isset($lines[$key])) $lines[$key]['quantity'] += $qty;
        else $lines[$key] = ['product_type_id' => $typeId, 'quantity' => $qty, 'unit_price' => $price];
    }
    $lines = array_values($lines);

    // Validate everything before touching the database.
    $typeCache = [];
    $qtyPerType = [];
    foreach ($lines as $i => $line) {
        $id = $line['product_type_id'];
        if (!isset($typeCache[$id])) {
            $stmt = $pdo->prepare('SELECT pt.*, p.name AS product_name FROM product_types pt JOIN products p ON p.id = pt.product_id WHERE pt.id = ? AND pt.is_active = 1');
            $stmt->execute([$id]);
            $typeCache[$id] = $stmt->fetch();
        }
        $type = $typeCache[$id];
        if (!$type) throw new RuntimeException('A product in this sale was not found.');
        $label = $type['product_name'] . ' — ' . $type['name'];

        $qtyPerType[$id] = ($qtyPerType[$id] ?? 0) + $line['quantity'];
        if ($qtyPerType[$id] > (int)$type['quantity']) {
            throw new RuntimeException("Only {$type['quantity']} {$type['unit']} of {$label} left in stock.");
        }

        $price = $line['unit_price'] ?? (float)$type['selling_price'];
        $floor = sale_floor_price($type);
        if ($price + 0.0001 < $floor) {
            throw new RuntimeException("{$label} cannot be sold below its minimum price of " . number_format($floor, 2) . '.');
        }
        if ($price <= 0) throw new RuntimeException("Enter a valid price for {$label}.");
        $lines[$i]['price'] = $price;
    }

    $pdo->beginTransaction();
    try {
        $receipt = generate_receipt_code();
        $out = [];
        $grandTotal = 0.0;
        $grandProfit = 0.0;
        $summary = [];

        foreach ($lines as $line) {
            $type = $typeCache[$line['product_type_id']];
            $qty = $line['quantity'];
            $unitPrice = (float)$line['price'];
            $unitCost = (float)$type['buying_price'];
            $totalAmount = round($unitPrice * $qty, 2);
            $totalCost = round($unitCost * $qty, 2);
            $profit = round($totalAmount - $totalCost, 2);

            $code = generate_sale_code();
            $pdo->prepare('
                INSERT INTO inventory_sales (sale_code, receipt_code, product_type_id, quantity, unit_price, unit_cost, total_amount, total_cost, profit, notes, payment_method, payment_channel, sold_by, request_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ')->execute([$code, $receipt, $type['id'], $qty, $unitPrice, $unitCost, $totalAmount, $totalCost, $profit, $notes, $paymentMethod, $paymentChannel, $soldBy, $requestId]);
            $saleId = (int)$pdo->lastInsertId();

            record_stock_movement((int)$type['id'], 'sale', 'out', $qty, 'sale', $saleId, $notes, $soldBy);

            $grandTotal += $totalAmount;
            $grandProfit += $profit;
            $summary[] = $type['product_name'] . ' — ' . $type['name'] . " x{$qty}";
            $out[] = [
                'sale_code' => $code, 'product_name' => $type['product_name'], 'type_name' => $type['name'],
                'unit' => $type['unit'], 'quantity' => $qty, 'unit_price' => $unitPrice, 'total_amount' => $totalAmount, 'profit' => $profit,
            ];
        }

        $creditInfo = null;
        if ($isCredit) {
            // Nothing is posted to the ledger yet — no money has been received.
            // The debt is opened instead; any amount paid now is its first payment.
            if ($credit['deposit'] > 0 && $credit['deposit'] + 0.004 >= round($grandTotal, 2)) {
                throw new RuntimeException('The customer is paying the full amount now — choose a normal payment method instead of credit.');
            }
            $debtId = create_customer_debt($receipt, $credit, $grandTotal, $soldBy, $notes);
            if ($credit['deposit'] > 0) {
                record_debt_payment($debtId, $credit['deposit'], $credit['deposit_method'], $credit['deposit_channel'], null, 'Paid at the time of sale', date('Y-m-d'), $soldBy);
            }
            $d = $pdo->prepare('SELECT debt_code, customer_name, customer_phone, total_amount, amount_paid, due_date FROM customer_debts WHERE id = ?');
            $d->execute([$debtId]);
            $row = $d->fetch();
            $creditInfo = [
                'debt_code' => $row['debt_code'], 'customer_name' => $row['customer_name'], 'customer_phone' => $row['customer_phone'],
                'paid' => (float)$row['amount_paid'], 'balance' => round((float)$row['total_amount'] - (float)$row['amount_paid'], 2),
                'due_date' => $row['due_date'],
            ];
        } else {
            record_transaction('income', 'product_sale', round($grandTotal, 2), date('Y-m-d'),
                mb_substr('Sale ' . $receipt . ': ' . implode('; ', $summary), 0, 255),
                null, null, null, null, $soldBy, $paymentMethod);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return ['receipt_code' => $receipt, 'items' => $out, 'total_amount' => round($grandTotal, 2), 'profit' => round($grandProfit, 2),
            'payment_method' => $paymentMethod, 'payment_channel' => $paymentChannel, 'credit' => $creditInfo];
}

function generate_receipt_code(): string
{
    global $pdo;
    do {
        $code = 'RC-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        $stmt = $pdo->prepare('SELECT 1 FROM inventory_sales WHERE receipt_code = ?');
        $stmt->execute([$code]);
    } while ($stmt->fetchColumn());
    return $code;
}

/** One-product sale — kept for any older caller; now just a one-line receipt. */
function record_sale(int $productTypeId, int $quantity, ?string $notes, ?int $soldBy): array
{
    $r = record_sale_items([['product_type_id' => $productTypeId, 'quantity' => $quantity]], $notes, $soldBy);
    $line = $r['items'][0];
    return [
        'sale_code' => $line['sale_code'], 'receipt_code' => $r['receipt_code'],
        'product_name' => $line['product_name'], 'type_name' => $line['type_name'],
        'quantity' => $line['quantity'], 'unit_price' => $line['unit_price'],
        'total_amount' => $r['total_amount'], 'profit' => $r['profit'],
    ];
}

/** Combined stock across every type under one parent product — always computed, never stored. */
function product_summary(): array
{
    global $pdo;
    return $pdo->query("
        SELECT p.id, p.name, p.description, p.is_active, p.category_id, c.name AS category_name,
            COUNT(pt.id) AS type_count,
            COALESCE(SUM(pt.quantity), 0) AS total_quantity,
            COALESCE(SUM(pt.quantity * pt.buying_price), 0) AS stock_value,
            SUM(pt.quantity <= pt.minimum_stock_level) AS low_stock_types
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN product_types pt ON pt.product_id = p.id AND pt.is_active = 1
        WHERE p.is_active = 1
        GROUP BY p.id, p.name, p.description, p.is_active, p.category_id, c.name
        ORDER BY p.name
    ")->fetchAll();
}
