-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.0 — Module facturation
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Colonnes facturation sur la table users
ALTER TABLE users
  ADD COLUMN billing_company_name VARCHAR(255) NULL,
  ADD COLUMN billing_siret VARCHAR(32) NULL,
  ADD COLUMN billing_address TEXT NULL,
  ADD COLUMN billing_postal_code VARCHAR(20) NULL,
  ADD COLUMN billing_city VARCHAR(255) NULL,
  ADD COLUMN billing_country VARCHAR(100) NULL DEFAULT 'France',
  ADD COLUMN billing_iban VARCHAR(64) NULL,
  ADD COLUMN billing_bic VARCHAR(32) NULL,
  ADD COLUMN billing_logo_base64 LONGTEXT NULL,
  ADD COLUMN billing_vat_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN billing_vat_rate INT NOT NULL DEFAULT 2000,
  ADD COLUMN billing_legal_mention TEXT NULL,
  ADD COLUMN billing_payment_terms TEXT NULL,
  ADD COLUMN auto_invoice_on_completed TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN invoice_counter_year INT NOT NULL DEFAULT 0,
  ADD COLUMN invoice_counter_value INT NOT NULL DEFAULT 0;

-- 2) Table invoices
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  number VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  issue_date BIGINT NOT NULL,
  due_date BIGINT NULL,
  appointment_id INT NULL,
  client_id INT NULL,
  client_first_name VARCHAR(255) NULL,
  client_last_name VARCHAR(255) NULL,
  client_email VARCHAR(255) NULL,
  client_address TEXT NULL,
  client_postal_code VARCHAR(20) NULL,
  client_city VARCHAR(255) NULL,
  subtotal_cents INT NOT NULL DEFAULT 0,
  vat_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,
  vat_rate INT NOT NULL DEFAULT 0,
  vat_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) NULL,
  paid_at BIGINT NULL,
  sent_at BIGINT NULL,
  notes TEXT NULL,
  practitioner_snapshot TEXT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_invoices_user (user_id),
  INDEX idx_invoices_status (status),
  INDEX idx_invoices_issue_date (issue_date),
  INDEX idx_invoices_appointment (appointment_id),
  INDEX idx_invoices_client (client_id),
  UNIQUE KEY uk_invoices_user_number (user_id, number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Table invoice_items
CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,
  INDEX idx_invoice_items_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
