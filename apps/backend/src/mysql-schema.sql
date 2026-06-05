CREATE TABLE users (
  id VARCHAR(80) PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(160) NOT NULL,
  role ENUM('super_admin', 'office_user', 'director') NOT NULL,
  password_hash VARCHAR(160) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL
);

CREATE TABLE tea_lines (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE suppliers (
  id VARCHAR(80) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  line_id VARCHAR(80),
  line_name VARCHAR(160) NOT NULL,
  deduction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  own_transport_addition_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  factory_transport_deduction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (line_id) REFERENCES tea_lines(id)
);

CREATE TABLE monthly_settings (
  month CHAR(7) PRIMARY KEY,
  tea_price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 200.00,
  deduction_percent DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  own_transport_addition_per_kg DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  factory_transport_deduction_per_kg DECIMAL(10,2) NOT NULL DEFAULT 3.00
);

CREATE TABLE supplier_month_overrides (
  id VARCHAR(80) PRIMARY KEY,
  supplier_id VARCHAR(80) NOT NULL,
  month CHAR(7) NOT NULL,
  tea_price_per_kg DECIMAL(10,2),
  disable_deduction BOOLEAN NOT NULL DEFAULT FALSE,
  disable_own_transport_addition BOOLEAN NOT NULL DEFAULT FALSE,
  disable_factory_transport_deduction BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY unique_supplier_month (supplier_id, month),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE collection_entries (
  id VARCHAR(80) PRIMARY KEY,
  mobile_record_id VARCHAR(80) UNIQUE,
  supplier_id VARCHAR(80) NOT NULL,
  supplier_code VARCHAR(40) NOT NULL,
  supplier_name VARCHAR(180) NOT NULL,
  line_id VARCHAR(80),
  line_name VARCHAR(160) NOT NULL,
  collection_date DATE NOT NULL,
  collection_time TIME,
  bag_count INT NOT NULL,
  original_gross_weight_kg DECIMAL(10,2) NOT NULL,
  gross_weight_kg DECIMAL(10,2) NOT NULL,
  net_weight_kg DECIMAL(10,2) NOT NULL,
  line_user_name VARCHAR(160) NOT NULL,
  print_status VARCHAR(40) NOT NULL,
  posted_at DATETIME NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE advances (
  id VARCHAR(80) PRIMARY KEY,
  supplier_id VARCHAR(80) NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  effective_month CHAR(7) NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE fertilizer_installments (
  id VARCHAR(80) PRIMARY KEY,
  fertilizer_issue_id VARCHAR(80) NOT NULL,
  supplier_id VARCHAR(80) NOT NULL,
  effective_month CHAR(7) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE tea_packets (
  id VARCHAR(80) PRIMARY KEY,
  supplier_id VARCHAR(80) NOT NULL,
  date DATE NOT NULL,
  packet_count INT NOT NULL,
  per_packet_price DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  effective_month CHAR(7) NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE arrears_ledger (
  id VARCHAR(80) PRIMARY KEY,
  supplier_id VARCHAR(80) NOT NULL,
  effective_month CHAR(7) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  note VARCHAR(255),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE sync_log (
  id VARCHAR(80) PRIMARY KEY,
  source VARCHAR(80) NOT NULL,
  synced_at DATETIME NOT NULL,
  summary_json JSON NOT NULL
);
