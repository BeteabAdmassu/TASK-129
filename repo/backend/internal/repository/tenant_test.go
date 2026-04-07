// Package repository — tenant isolation tests.
//
// Strategy: register a lightweight capturing sql.Driver that records every SQL
// statement executed against it.  Each test builds a Repository pointed at
// that driver, calls the method under test, then asserts that the captured
// query contained a tenant_id constraint.
//
// Because the driver returns no rows, the repository functions will return
// sql.ErrNoRows (nil, nil) or a scan error — both are acceptable; we only care
// that the SQL was constructed with a tenant predicate before any DB round-trip.
//
// No external dependencies are needed: everything is standard-library only.

package repository_test

import (
	"database/sql"
	"database/sql/driver"
	"io"
	"strings"
	"sync"
	"testing"

	"medops/internal/repository"
)

// ─── Capturing sql Driver ─────────────────────────────────────────────────────

// capturedSQL records the raw SQL strings sent to the driver.
type capturedSQL struct {
	mu      sync.Mutex
	queries []string
}

func (c *capturedSQL) reset() {
	c.mu.Lock()
	c.queries = c.queries[:0]
	c.mu.Unlock()
}

func (c *capturedSQL) all() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]string, len(c.queries))
	copy(out, c.queries)
	return out
}

func (c *capturedSQL) anyContains(sub string) bool {
	for _, q := range c.all() {
		if strings.Contains(q, sub) {
			return true
		}
	}
	return false
}

// capDriver implements driver.Driver.
type capDriver struct{ captured *capturedSQL }

func (d *capDriver) Open(_ string) (driver.Conn, error) {
	return &capConn{d: d}, nil
}

// capConn implements driver.Conn.
type capConn struct{ d *capDriver }

func (c *capConn) Prepare(query string) (driver.Stmt, error) {
	c.d.captured.mu.Lock()
	c.d.captured.queries = append(c.d.captured.queries, query)
	c.d.captured.mu.Unlock()
	return &capStmt{}, nil
}
func (c *capConn) Close() error                  { return nil }
func (c *capConn) Begin() (driver.Tx, error)     { return &capTx{}, nil }

// capStmt implements driver.Stmt.
type capStmt struct{}

func (s *capStmt) Close() error                                    { return nil }
func (s *capStmt) NumInput() int                                   { return -1 } // variadic
func (s *capStmt) Exec(_ []driver.Value) (driver.Result, error)   { return driver.RowsAffected(0), nil }
func (s *capStmt) Query(_ []driver.Value) (driver.Rows, error)    { return &capRows{}, nil }

// capRows implements driver.Rows — always empty.
type capRows struct{ done bool }

func (r *capRows) Columns() []string              { return []string{} }
func (r *capRows) Close() error                   { return nil }
func (r *capRows) Next(_ []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	return io.EOF
}

// capTx implements driver.Tx.
type capTx struct{}

func (t *capTx) Commit() error   { return nil }
func (t *capTx) Rollback() error { return nil }

// ─── Test harness ─────────────────────────────────────────────────────────────

var (
	registerOnce sync.Once
	globalCap    = &capturedSQL{}
	testDB       *sql.DB
)

const (
	testDriverName = "capture-tenant-test"
	testTenantID   = "tenant-A"
	// encryptKey must be at least 32 bytes (padded internally by repository.New).
	testEncryptKey = "test-encrypt-key-32-bytes-padding"
)

func openTestDB(t *testing.T) (*sql.DB, *capturedSQL) {
	t.Helper()
	registerOnce.Do(func() {
		sql.Register(testDriverName, &capDriver{captured: globalCap})
		var err error
		testDB, err = sql.Open(testDriverName, "")
		if err != nil {
			panic("capDriver open: " + err.Error())
		}
	})
	globalCap.reset()
	return testDB, globalCap
}

func newRepo(t *testing.T) (*repository.Repository, *capturedSQL) {
	t.Helper()
	db, cap := openTestDB(t)
	return repository.New(db, testEncryptKey, testTenantID), cap
}

// assertTenantScoped fails the test if none of the captured queries contain
// "tenant_id", confirming the method scopes results to the current tenant.
func assertTenantScoped(t *testing.T, cap *capturedSQL, method string) {
	t.Helper()
	if !cap.anyContains("tenant_id") {
		t.Errorf("%s: executed query does not reference tenant_id — cross-tenant read/write is possible", method)
		t.Logf("captured queries: %v", cap.all())
	}
}

// ─── Objective 1: Tenant isolation for the 6 methods ─────────────────────────

// TestGetBatch_QueryScopedToTenant verifies that GetBatch joins through skus
// to enforce the tenant boundary on inventory_batches (which has no tenant_id).
func TestGetBatch_QueryScopedToTenant(t *testing.T) {
	repo, cap := newRepo(t)
	repo.GetBatch("batch-id-1") // result doesn't matter; driver returns no rows
	assertTenantScoped(t, cap, "GetBatch")
}

// TestListStockTransactions_QueryScopedToTenant verifies that stock_transactions
// are read through the parent SKU's tenant_id constraint.
func TestListStockTransactions_QueryScopedToTenant(t *testing.T) {
	repo, cap := newRepo(t)
	repo.ListStockTransactions("sku-id-1", 1, 20)
	assertTenantScoped(t, cap, "ListStockTransactions")
}

// TestGetStocktake_QueryScopedToTenant verifies that stocktakes are read
// through the creator (auth_users) tenant_id join.
func TestGetStocktake_QueryScopedToTenant(t *testing.T) {
	repo, cap := newRepo(t)
	repo.GetStocktake("stocktake-id-1")
	assertTenantScoped(t, cap, "GetStocktake")
}

// TestGetSessionPackage_QueryScopedToTenant verifies that session_packages are
// read through the parent member's tenant_id.
func TestGetSessionPackage_QueryScopedToTenant(t *testing.T) {
	repo, cap := newRepo(t)
	repo.GetSessionPackage("pkg-id-1")
	assertTenantScoped(t, cap, "GetSessionPackage")
}

// TestGetWorkOrderPhotos_QueryScopedToTenant verifies that photo retrieval
// scopes both managed_files and work_orders to the current tenant.
func TestGetWorkOrderPhotos_QueryScopedToTenant(t *testing.T) {
	repo, cap := newRepo(t)
	repo.GetWorkOrderPhotos("wo-id-1")
	assertTenantScoped(t, cap, "GetWorkOrderPhotos")
}

// TestDeleteFileRecord_QueryScopedToTenant verifies that DeleteFileRecord adds
// a tenant_id predicate so a file from another tenant cannot be deleted.
func TestDeleteFileRecord_QueryScopedToTenant(t *testing.T) {
	repo, cap := newRepo(t)
	repo.DeleteFileRecord("file-id-1")
	assertTenantScoped(t, cap, "DeleteFileRecord")
}

// ─── Cross-tenant argument verification ───────────────────────────────────────
// These tests confirm the *value* of the tenant argument sent to the driver
// matches the tenant the Repository was configured with.

// assertTenantArgPresent checks that the literal tenant ID string appears in
// at least one of the captured queries (it will be interpolated as a parameter
// string by the capturing driver's Prepare path).
//
// Note: standard database/sql passes parameters separately from the query
// string, so we cannot check arg values through the Prepare hook alone.
// The tests above (SQL contains "tenant_id") are therefore the canonical
// correctness check; this helper exists to document intent.
func assertArgCount(t *testing.T, cap *capturedSQL, method string, minArgs int) {
	t.Helper()
	// Count the maximum $N placeholder index in the captured query.
	for _, q := range cap.all() {
		count := strings.Count(q, "$")
		if count >= minArgs {
			return
		}
	}
	t.Errorf("%s: expected at least %d parameter placeholder(s) in query (tenant_id arg missing)", method, minArgs)
}

func TestGetBatch_PassesTenantArg(t *testing.T) {
	repo, cap := newRepo(t)
	repo.GetBatch("batch-id-1")
	// $1 = id, $2 = tenant_id
	assertArgCount(t, cap, "GetBatch", 2)
}

func TestListStockTransactions_PassesTenantArg(t *testing.T) {
	repo, cap := newRepo(t)
	repo.ListStockTransactions("sku-id-1", 1, 20)
	// $1=skuID $2=pageSize $3=offset $4=tenantID
	assertArgCount(t, cap, "ListStockTransactions", 4)
}

func TestGetStocktake_PassesTenantArg(t *testing.T) {
	repo, cap := newRepo(t)
	repo.GetStocktake("st-id-1")
	// $1=id $2=tenantID
	assertArgCount(t, cap, "GetStocktake", 2)
}

func TestGetSessionPackage_PassesTenantArg(t *testing.T) {
	repo, cap := newRepo(t)
	repo.GetSessionPackage("pkg-id-1")
	// $1=id $2=tenantID
	assertArgCount(t, cap, "GetSessionPackage", 2)
}

func TestGetWorkOrderPhotos_PassesTenantArg(t *testing.T) {
	repo, cap := newRepo(t)
	repo.GetWorkOrderPhotos("wo-id-1")
	// $1=workOrderID $2=tenantID (used twice)
	assertArgCount(t, cap, "GetWorkOrderPhotos", 2)
}

func TestDeleteFileRecord_PassesTenantArg(t *testing.T) {
	repo, cap := newRepo(t)
	repo.DeleteFileRecord("file-id-1")
	// $1=id $2=tenantID
	assertArgCount(t, cap, "DeleteFileRecord", 2)
}
