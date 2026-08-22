-- ============================================================
-- Dayflow HRMS - SQLite schema (mirrors backend/models/*.py)
--
-- The Flask app creates these tables automatically via
-- SQLAlchemy (db.create_all()). This file documents the schema
-- and can be applied manually with:
--     sqlite3 dayflow.db < database/schema.sql
-- ============================================================
PRAGMA foreign_keys = ON;


-- employees
CREATE TABLE employees (
	id VARCHAR(15) NOT NULL, 
	name VARCHAR(80) NOT NULL, 
	department VARCHAR(60) NOT NULL, 
	position VARCHAR(80) NOT NULL, 
	join_date DATE NOT NULL, 
	phone VARCHAR(30) NOT NULL, 
	address VARCHAR(200) NOT NULL, 
	photo TEXT, 
	documents JSON, 
	created_at DATETIME NOT NULL, 
	basic INTEGER NOT NULL, 
	hra INTEGER NOT NULL, 
	transport INTEGER NOT NULL, 
	special INTEGER NOT NULL, 
	pf INTEGER NOT NULL, 
	pt INTEGER NOT NULL, 
	insurance INTEGER NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_employees_department ON employees (department);

-- users
CREATE TABLE users (
	id INTEGER NOT NULL, 
	email VARCHAR(120) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role VARCHAR(10) NOT NULL, 
	employee_id VARCHAR(15) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (employee_id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ix_users_email ON users (email);

-- attendance
CREATE TABLE attendance (
	id INTEGER NOT NULL, 
	employee_id VARCHAR(15) NOT NULL, 
	date DATE NOT NULL, 
	status VARCHAR(12) NOT NULL, 
	check_in VARCHAR(5), 
	check_out VARCHAR(5), 
	PRIMARY KEY (id), 
	CONSTRAINT uq_attendance_employee_date UNIQUE (employee_id, date), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE
);
CREATE INDEX ix_attendance_employee_id ON attendance (employee_id);
CREATE INDEX ix_attendance_date ON attendance (date);

-- leaves
CREATE TABLE leaves (
	id VARCHAR(10) NOT NULL, 
	employee_id VARCHAR(15) NOT NULL, 
	type VARCHAR(10) NOT NULL, 
	from_date DATE NOT NULL, 
	to_date DATE NOT NULL, 
	days INTEGER NOT NULL, 
	remarks TEXT NOT NULL, 
	status VARCHAR(10) NOT NULL, 
	hr_comment TEXT, 
	created_at DATETIME NOT NULL, 
	decided_at DATETIME, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_leave_type CHECK (type IN ('paid','sick','unpaid')), 
	CONSTRAINT ck_leave_status CHECK (status IN ('pending','approved','rejected')), 
	CONSTRAINT ck_leave_range CHECK (to_date >= from_date), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE
);
CREATE INDEX ix_leave_status ON leaves (status);
CREATE INDEX ix_leaves_employee_id ON leaves (employee_id);

-- payrolls
CREATE TABLE payrolls (
	id INTEGER NOT NULL, 
	employee_id VARCHAR(15) NOT NULL, 
	month VARCHAR(7) NOT NULL, 
	basic INTEGER NOT NULL, 
	hra INTEGER NOT NULL, 
	transport INTEGER NOT NULL, 
	special INTEGER NOT NULL, 
	pf INTEGER NOT NULL, 
	pt INTEGER NOT NULL, 
	insurance INTEGER NOT NULL, 
	allowances INTEGER NOT NULL, 
	deductions INTEGER NOT NULL, 
	net INTEGER NOT NULL, 
	status VARCHAR(12) NOT NULL, 
	paid_on DATE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_payroll_employee_month UNIQUE (employee_id, month), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE
);
CREATE INDEX ix_payrolls_employee_id ON payrolls (employee_id);

-- activities
CREATE TABLE activities (
	id INTEGER NOT NULL, 
	icon VARCHAR(20) NOT NULL, 
	text TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_activities_created_at ON activities (created_at);
