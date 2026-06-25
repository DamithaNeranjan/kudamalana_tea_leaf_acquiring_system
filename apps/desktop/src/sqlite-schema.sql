CREATE TABLE office_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE line_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE tea_lines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  line_id TEXT,
  line_name TEXT NOT NULL,
  deduction_enabled INTEGER NOT NULL DEFAULT 0,
  own_transport_addition_enabled INTEGER NOT NULL DEFAULT 0,
  factory_transport_deduction_enabled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE monthly_settings (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  tea_price_per_kg REAL NOT NULL DEFAULT 200,
  deduction_percent REAL NOT NULL DEFAULT 2,
  own_transport_addition_per_kg REAL NOT NULL DEFAULT 5,
  factory_transport_deduction_per_kg REAL NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL
);

CREATE TABLE supplier_month_overrides (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  month TEXT NOT NULL,
  tea_price_per_kg REAL,
  disable_deduction INTEGER NOT NULL DEFAULT 0,
  disable_own_transport_addition INTEGER NOT NULL DEFAULT 0,
  disable_factory_transport_deduction INTEGER NOT NULL DEFAULT 0,
  UNIQUE (supplier_id, month)
);

CREATE TABLE collection_staging (
  id TEXT PRIMARY KEY,
  mobile_record_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_code TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  line_id TEXT,
  line_name TEXT NOT NULL,
  collection_date TEXT NOT NULL,
  collection_time TEXT,
  bag_count INTEGER NOT NULL,
  original_gross_weight_kg REAL NOT NULL,
  gross_weight_kg REAL NOT NULL,
  net_weight_kg REAL NOT NULL,
  line_user_name TEXT NOT NULL,
  print_status TEXT NOT NULL,
  tablet_saved_at TEXT,
  tablet_printed_at TEXT,
  imported_at TEXT NOT NULL,
  reviewed_at TEXT,
  status TEXT NOT NULL
);

CREATE TABLE collection_entries (
  id TEXT PRIMARY KEY,
  mobile_record_id TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL,
  supplier_code TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  line_id TEXT,
  line_name TEXT NOT NULL,
  collection_date TEXT NOT NULL,
  collection_time TEXT,
  bag_count INTEGER NOT NULL,
  original_gross_weight_kg REAL NOT NULL,
  gross_weight_kg REAL NOT NULL,
  net_weight_kg REAL NOT NULL,
  line_user_name TEXT NOT NULL,
  print_status TEXT NOT NULL,
  tablet_saved_at TEXT,
  tablet_printed_at TEXT,
  posted_at TEXT NOT NULL,
  posted_by_office_user_id TEXT,
  posted_by_office_user_name TEXT
);

CREATE TABLE advances (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  effective_month TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE fertilizer_issues (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  date TEXT NOT NULL,
  kg_given REAL NOT NULL,
  total_amount REAL NOT NULL,
  split_months INTEGER NOT NULL,
  effective_month_1 TEXT NOT NULL,
  effective_month_2 TEXT,
  updated_at TEXT
);

CREATE TABLE fertilizer_installments (
  id TEXT PRIMARY KEY,
  fertilizer_issue_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  amount REAL NOT NULL
);

CREATE TABLE tea_packets (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  date TEXT NOT NULL,
  packet_count INTEGER NOT NULL,
  per_packet_price REAL NOT NULL,
  total_amount REAL NOT NULL,
  effective_month TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE arrears_ledger (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT
);

CREATE TABLE sync_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  device_id TEXT,
  imported_count INTEGER,
  skipped_count INTEGER,
  synced_at TEXT NOT NULL
);
