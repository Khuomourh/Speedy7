const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const INPUT_FILES = [
  'C:\\Users\\Khuomourh Ikanyeng\\Downloads\\AutoExpress_23032015.xlsx',
  'C:\\Users\\Khuomourh Ikanyeng\\Downloads\\Motovac_Stock_and_sales.xlsx',
  'C:\\Users\\Khuomourh Ikanyeng\\Downloads\\workout file.xlsx',
];

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'parts-database');

const OUTPUT_COLUMNS = [
  'category',
  'source_file',
  'source_sheet',
  'part_code',
  'alternate_codes',
  'description',
  'extended_description',
  'product_class',
  'stock_quantity',
  'monthly_sales',
  'cost_price',
  'selling_price',
  'supplier',
  'needs_review',
];

const CATEGORY_ORDER = [
  'Engine',
  'Suspension',
  'Brake',
  'Bearing',
  'Cooling',
  'Electrical',
  'Service',
  'Body',
  'Transmission',
  'Exhaust',
  'Tyres & Wheels',
  'Accessories',
  'Review Needed',
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function numeric(value) {
  const text = clean(value);
  if (!text || /^#n\/a$/i.test(text)) return '';

  const isNegative = /^\(.*\)$/.test(text);
  const stripped = text
    .replace(/[(),]/g, '')
    .replace(/[^\d.-]/g, '');
  if (!stripped || stripped === '-' || stripped === '.') return '';

  const parsed = Number(stripped);
  if (!Number.isFinite(parsed)) return '';
  return String(isNegative ? -parsed : parsed);
}

function firstIndex(headers, tests) {
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (tests.some((test) => test(header))) return index;
  }
  return -1;
}

function allIndexes(headers, tests) {
  const indexes = [];
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (tests.some((test) => test(header))) indexes.push(index);
  }
  return indexes;
}

function splitCodes(values) {
  const codes = [];
  for (const raw of values) {
    for (const item of clean(raw).split(/[;,|=]/)) {
      const code = clean(item);
      if (code) codes.push(code);
    }
  }
  return codes;
}

function hasWord(text, word) {
  return new RegExp(`(^| )${word}( |$)`).test(text);
}

function findHeaderRow(rows) {
  let bestIndex = -1;
  let bestScore = -1;
  const maxRows = Math.min(rows.length, 30);

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const headers = rows[rowIndex].map(normalized);
    const joined = headers.join(' ');
    let score = 0;

    if (/description|longdescription|details descriptions/.test(joined)) score += 5;
    if (/(^| )code( |$)|stockcode|part no|key words|brkeyword|part quip/.test(joined)) score += 4;
    if (/cost|price|selling|purchase/.test(joined)) score += 2;
    if (/stock|sales|supplier|group|productclass/.test(joined)) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  }

  return bestScore >= 6 ? bestIndex : -1;
}

function getColumnMap(headerRow) {
  const headers = headerRow.map(normalized);

  const codeTests = [
    (h) => h === 'stockcode',
    (h) => h === 'code',
    (h) => h === 'key words',
    (h) => h === 'brkeyword',
    (h) => h === 'part quip number',
    (h) => h === 'motovac part no',
    (h) => h.endsWith(' part no') && !h.includes('supplier'),
  ];
  const codeCandidates = allIndexes(headers, codeTests);
  const code = codeCandidates.length ? codeCandidates[0] : -1;

  const description = firstIndex(headers, [
    (h) => h === 'description',
    (h) => h === 'longdescription',
    (h) => h.includes('part description'),
    (h) => h.includes('parts detais descriptions'),
    (h) => h.includes('details descriptions'),
  ]);

  const extendedDescription = firstIndex(headers, [
    (h) => h === 'extendeddescription',
    (h) => h === 'additionalinfo',
    (h) => h === 'additional info',
  ]);

  const productClass = firstIndex(headers, [
    (h) => h === 'productclass',
    (h) => h === 'product class',
    (h) => h === 'group',
  ]);

  const stock = firstIndex(headers, [
    (h) => h.includes('stock on hand'),
    (h) => h.includes('stock in hand'),
    (h) => h === 'stock',
  ]);

  const monthlySales = firstIndex(headers, [
    (h) => h.includes('sales per month'),
    (h) => h === 'motovac sales',
    (h) => h === 'sales',
  ]);

  const cost = firstIndex(headers, [
    (h) => h.includes('buying cost'),
    (h) => h.includes('average cost'),
    (h) => h.includes('purchase cost'),
    (h) => h.includes('purchase price'),
    (h) => h.includes('puchase price'),
    (h) => h === 'cost',
    (h) => h === 'motovac cost',
    (h) => h.includes('motovac cost'),
  ]);

  const selling = firstIndex(headers, [
    (h) => h.includes('selling price'),
    (h) => h.includes('selling cost'),
    (h) => h.includes('suggested selling'),
    (h) => h === 'price',
    (h) => h.includes('south africa local suppliers'),
  ]);

  const supplier = firstIndex(headers, [
    (h) => h.includes('supplier') && !h.includes('part no') && !h.includes('south africa local suppliers'),
  ]);

  const alternateCodes = allIndexes(headers, [
    (h) => h.includes('alternate'),
    (h) => h.includes('competitor'),
    (h) => h.includes('alt part no'),
    (h) => h.includes('supplier part no'),
  ]).filter((index) => index !== code);

  return {
    code,
    description,
    extendedDescription,
    productClass,
    stock,
    monthlySales,
    cost,
    selling,
    supplier,
    alternateCodes,
    codeCandidates,
  };
}

function value(row, index) {
  if (index < 0) return '';
  return clean(row[index]);
}

function joinCodes(values, primary) {
  const seen = new Set([normalized(primary)]);
  const codes = [];

  for (const code of splitCodes(values)) {
    const key = normalized(code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    codes.push(code);
  }

  return codes.join(' | ');
}

function categorize(record) {
  const haystack = normalized([
    record.source_sheet,
    record.product_class,
    record.description,
    record.extended_description,
    record.part_code,
  ].join(' '));

  if (/brake|disc pad|brake pad|caliper|rotor|brake shoe|brake drum/.test(haystack)) return 'Brake';
  if (/wheel bearing|bearing kit|hub bearing|bearing|bea /.test(`${haystack} `)) return 'Bearing';
  if (/water pump|radiator|thermostat|thermos|coolant|cooling|water flange|fan belt|heater pipe|water hose/.test(haystack)) return 'Cooling';
  if (/starter|alternator|spark plug|glow plug|ignition|sensor|lamp|headlight|tail light|switch|relay|battery|electrical/.test(haystack)) return 'Electrical';
  if (/shock|strut|control arm|ball joint|tie rod|rack end|steering|suspension|stabilizer|stabiliser|bush|cv joint|cv boot|cv |tripod|idler|pitman|linkage|gas shock| sus /.test(` ${haystack} `)) return 'Suspension';
  if (/filter|engine oil|oil filter|air filter|fuel filter|service kit|antifreeze|lubricant|frey/.test(haystack)) return 'Service';
  if (/bumper|bonnet|fender|grille|mirror|door|tailgate|body|panel|clip|moulding/.test(haystack)) return 'Body';
  if (/clutch|gearbox|transmission|flywheel|release bearing/.test(haystack)) return 'Transmission';
  if (/exhaust|silencer|muffler|catalytic/.test(haystack)) return 'Exhaust';
  if (/wheel|rim|tyre|tire|whhel/.test(haystack)) return 'Tyres & Wheels';
  if (/engine|mounting|mountibng|mounting|piston| pis |gasket|valve|timing|crank|camshaft|cylinder|oil pump|fuel pump|injector|manifold/.test(` ${haystack} `)) return 'Engine';
  if (/accessory|accessories|tool|cleaner/.test(haystack)) return 'Accessories';

  return 'Review Needed';
}

function sheetShouldBeSkipped(fileName, sheetName) {
  const file = normalized(fileName);
  const sheet = normalized(sheetName);

  if (file.includes('motovac')) {
    return [
      'customer name',
      'south africa supplier name',
      'sheet1',
      'sheet2',
    ].includes(sheet);
  }

  return false;
}

function rowIsEmpty(row) {
  return row.every((cell) => !clean(cell));
}

function importSheet(fileName, sheetName, rows) {
  if (!rows.length) return { records: [], skipped: 'empty sheet' };

  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) return { records: [], skipped: 'no parts header found' };

  const headerRow = rows[headerIndex];
  const columns = getColumnMap(headerRow);
  const records = [];

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (rowIsEmpty(row)) continue;

    const primaryCodeOptions = splitCodes(columns.codeCandidates.map((column) => value(row, column)));
    const alternateCodeOptions = splitCodes(columns.alternateCodes.map((column) => value(row, column)));
    const partCode = primaryCodeOptions[0] || alternateCodeOptions[0] || '';
    const description = value(row, columns.description);
    const extendedDescription = value(row, columns.extendedDescription);
    if (!partCode && !description && !extendedDescription) continue;

    const productClass = value(row, columns.productClass);
    const record = {
      category: '',
      source_file: fileName,
      source_sheet: sheetName,
      part_code: partCode,
      alternate_codes: joinCodes([...primaryCodeOptions.slice(1), ...alternateCodeOptions], partCode),
      description,
      extended_description: extendedDescription,
      product_class: productClass,
      stock_quantity: numeric(value(row, columns.stock)),
      monthly_sales: numeric(value(row, columns.monthlySales)),
      cost_price: numeric(value(row, columns.cost)),
      selling_price: numeric(value(row, columns.selling)),
      supplier: value(row, columns.supplier),
      needs_review: '',
    };

    record.category = categorize(record);
    const reviewReasons = [];
    if (record.category === 'Review Needed') reviewReasons.push('category');
    if (!record.part_code) reviewReasons.push('code');
    if (!record.description) reviewReasons.push('description');
    if (!record.cost_price && !record.selling_price) reviewReasons.push('price');
    record.needs_review = reviewReasons.join('; ');

    records.push(record);
  }

  return { records, skipped: '' };
}

function csvEscape(value) {
  const text = clean(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(filePath, rows, columns = OUTPUT_COLUMNS) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function summarizeByCategory(records) {
  const summary = new Map();

  for (const record of records) {
    if (!summary.has(record.category)) {
      summary.set(record.category, {
        category: record.category,
        rows: 0,
        with_cost: 0,
        with_selling_price: 0,
        with_stock: 0,
        needs_review: 0,
      });
    }

    const item = summary.get(record.category);
    item.rows += 1;
    if (record.cost_price) item.with_cost += 1;
    if (record.selling_price) item.with_selling_price += 1;
    if (record.stock_quantity) item.with_stock += 1;
    if (record.needs_review) item.needs_review += 1;
  }

  return Array.from(summary.values()).sort((a, b) => {
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  });
}

function summarizeBySource(records) {
  const summary = new Map();

  for (const record of records) {
    const key = `${record.source_file} / ${record.source_sheet}`;
    if (!summary.has(key)) {
      summary.set(key, {
        source_file: record.source_file,
        source_sheet: record.source_sheet,
        rows: 0,
      });
    }
    summary.get(key).rows += 1;
  }

  return Array.from(summary.values()).sort((a, b) => {
    return `${a.source_file} ${a.source_sheet}`.localeCompare(`${b.source_file} ${b.source_sheet}`);
  });
}

function importWorkbook(inputFile) {
  const fileName = path.basename(inputFile);
  console.log(`Reading ${fileName}`);
  const workbook = XLSX.readFile(inputFile, { cellDates: false, raw: false });
  const records = [];
  const skippedSheets = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetShouldBeSkipped(fileName, sheetName)) {
      skippedSheets.push({ source_file: fileName, source_sheet: sheetName, reason: 'not a parts sheet' });
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
    });

    const result = importSheet(fileName, sheetName, rows);
    if (result.skipped) {
      skippedSheets.push({ source_file: fileName, source_sheet: sheetName, reason: result.skipped });
      continue;
    }

    records.push(...result.records);
    console.log(`  ${sheetName}: ${result.records.length} rows`);
  }

  return { records, skippedSheets };
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const categoryDir = path.join(OUTPUT_DIR, 'categories');
  fs.rmSync(categoryDir, { recursive: true, force: true });
  fs.mkdirSync(categoryDir, { recursive: true });

  const allRecords = [];
  const skippedSheets = [];

  for (const inputFile of INPUT_FILES) {
    if (!fs.existsSync(inputFile)) {
      skippedSheets.push({
        source_file: path.basename(inputFile),
        source_sheet: '',
        reason: 'file not found',
      });
      continue;
    }

    const result = importWorkbook(inputFile);
    allRecords.push(...result.records);
    skippedSheets.push(...result.skippedSheets);
  }

  allRecords.sort((a, b) => {
    const categoryCompare = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryCompare !== 0) return categoryCompare;
    return `${a.description} ${a.part_code}`.localeCompare(`${b.description} ${b.part_code}`);
  });

  writeCsv(path.join(OUTPUT_DIR, 'combined-parts.csv'), allRecords);

  const byCategory = summarizeByCategory(allRecords);
  writeCsv(path.join(OUTPUT_DIR, 'summary-by-category.csv'), byCategory, [
    'category',
    'rows',
    'with_cost',
    'with_selling_price',
    'with_stock',
    'needs_review',
  ]);

  const bySource = summarizeBySource(allRecords);
  writeCsv(path.join(OUTPUT_DIR, 'summary-by-source.csv'), bySource, [
    'source_file',
    'source_sheet',
    'rows',
  ]);

  writeCsv(path.join(OUTPUT_DIR, 'skipped-sheets.csv'), skippedSheets, [
    'source_file',
    'source_sheet',
    'reason',
  ]);

  const reviewRows = allRecords.filter((record) => record.needs_review);
  writeCsv(path.join(OUTPUT_DIR, 'review-needed.csv'), reviewRows);

  for (const category of CATEGORY_ORDER) {
    const rows = allRecords.filter((record) => record.category === category);
    if (!rows.length) continue;
    const fileName = `${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    writeCsv(path.join(categoryDir, fileName), rows);
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'sample-parts.json'),
    JSON.stringify(allRecords.slice(0, 100), null, 2),
    'utf8',
  );

  const report = {
    generated_at: new Date().toISOString(),
    input_files: INPUT_FILES.map((file) => path.basename(file)),
    total_rows: allRecords.length,
    category_count: byCategory.length,
    review_rows: reviewRows.length,
    skipped_sheets: skippedSheets,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'import-report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  const categoryLines = byCategory.map((row) => {
    return `- ${row.category}: ${row.rows} rows, ${row.with_cost} with cost, ${row.with_selling_price} with selling price, ${row.with_stock} with stock, ${row.needs_review} needing review`;
  }).join('\n');

  const sourceLines = bySource.map((row) => {
    return `- ${row.source_file} / ${row.source_sheet}: ${row.rows} rows`;
  }).join('\n');

  const skippedLines = skippedSheets.length
    ? skippedSheets.map((row) => `- ${row.source_file} / ${row.source_sheet || '(file)'}: ${row.reason}`).join('\n')
    : '- None';

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'README.md'),
    [
      '# Speedy7 Parts Database Import',
      '',
      `Generated: ${new Date().toLocaleString()}`,
      '',
      'This folder contains the first combined stock database for Speedy7. The main file is `combined-parts.csv`.',
      '',
      '## Category Summary',
      '',
      categoryLines,
      '',
      '## Source Summary',
      '',
      sourceLines,
      '',
      '## Skipped Sheets',
      '',
      skippedLines,
      '',
      '## Review Notes',
      '',
      '`review-needed.csv` contains rows with missing codes, missing descriptions, missing prices, or categories that need manual checking before upload to the live Supabase database.',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`Imported ${allRecords.length} rows`);
  console.log(`Needs review: ${reviewRows.length} rows`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main();
