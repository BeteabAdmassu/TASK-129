/**
 * components.test.tsx — Component/route-render integration tests (F-010).
 *
 * Uses React Testing Library to render actual components and assert that
 * the correct DOM elements are present — verifying route/page wiring at
 * the render level, not just at the logic level.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ─── Mock useAuth so components can render without a real auth server ─────────

const mockUseAuth = {
  isAuthenticated: false,
  user: null as null | { id: string; username: string; role: string },
  loading: false,
  error: null as string | null,
  login: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth,
}));

// ─── Mock API service to prevent real HTTP calls ──────────────────────────────

// vi.hoisted ensures mock functions are created before vi.mock hoists its factory.
const mockWorkOrdersGet = vi.hoisted(() => vi.fn());
// Shared list mock that returns a resolved promise so DashboardPage can load.
const mockWorkOrdersList = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { data: [], total: 0, page: 1, page_size: 20 } })
);
const mockUsersList = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: [] })
);
const mockSystemHealth = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { status: 'ok' } })
);

vi.mock('../services/api', () => ({
  authAPI: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
  skusAPI: {
    getLowStock: vi.fn().mockResolvedValue({ data: { data: [] } }),
  },
  inventoryAPI: { listSKUs: vi.fn(), getSKU: vi.fn() },
  membersAPI: {
    listMembers: vi.fn(),
    getMember: vi.fn(),
    list: vi.fn().mockResolvedValue({ data: { data: [], total: 0 } }),
  },
  usersAPI: {
    list: mockUsersList,
  },
  systemAPI: {
    health: mockSystemHealth,
  },
  workOrdersAPI: {
    listWorkOrders: vi.fn(),
    get: mockWorkOrdersGet,
    list: mockWorkOrdersList,
  },
  learningAPI: { listSubjects: vi.fn(), listChapters: vi.fn() },
}));

// ─── Import pages AFTER mocks are in place ────────────────────────────────────

import LoginPage from '../components/admin/LoginPage';
import DashboardPage from '../components/admin/DashboardPage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderInRouter(element: React.ReactElement, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── LoginPage render tests ───────────────────────────────────────────────────

describe('LoginPage component render', () => {
  beforeEach(() => {
    mockUseAuth.isAuthenticated = false;
    mockUseAuth.user = null;
    mockUseAuth.error = null;
    mockUseAuth.loading = false;
    mockUseAuth.login.mockReset();
  });

  it('renders the application title', () => {
    renderInRouter(<LoginPage />);
    expect(screen.getByText('MedOps Console')).toBeTruthy();
  });

  it('renders a username input field', () => {
    renderInRouter(<LoginPage />);
    const usernameInput = screen.getByPlaceholderText(/username/i);
    expect(usernameInput).toBeTruthy();
  });

  it('renders a password input field', () => {
    renderInRouter(<LoginPage />);
    const passwordInput = screen.getByPlaceholderText(/password/i);
    expect(passwordInput).toBeTruthy();
  });

  it('renders a submit button', () => {
    renderInRouter(<LoginPage />);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    expect(submitBtn).toBeTruthy();
  });

  it('shows validation error when submitting empty form', async () => {
    renderInRouter(<LoginPage />);
    const btn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/username is required/i)).toBeTruthy();
    });
  });

  it('shows password validation error when only username is filled', async () => {
    renderInRouter(<LoginPage />);
    const usernameInput = screen.getByPlaceholderText(/username/i);
    fireEvent.change(usernameInput, { target: { value: 'admin' } });
    const btn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeTruthy();
    });
  });

  it('calls login with credentials when form is submitted with valid input', async () => {
    mockUseAuth.login.mockResolvedValueOnce({ id: '1', username: 'admin', role: 'system_admin' });
    renderInRouter(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText(/username/i), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'AdminPass1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockUseAuth.login).toHaveBeenCalledWith('admin', 'AdminPass1234');
    });
  });

  it('renders error message from useAuth when login fails', () => {
    mockUseAuth.error = 'Invalid credentials';
    renderInRouter(<LoginPage />);
    expect(screen.getByText(/invalid credentials/i)).toBeTruthy();
  });

  it('disables the submit button while loading', () => {
    mockUseAuth.loading = true;
    renderInRouter(<LoginPage />);
    const btn = screen.getByRole('button', { name: /signing in/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ─── DashboardPage render tests ───────────────────────────────────────────────

describe('DashboardPage component render', () => {
  beforeEach(() => {
    mockUseAuth.isAuthenticated = true;
    mockUseAuth.user = { id: '1', username: 'admin', role: 'system_admin' };
  });

  it('renders without crashing when user is authenticated', () => {
    renderInRouter(<DashboardPage />);
    // If it renders without throwing, the route/component wiring works
    expect(document.body).toBeTruthy();
  });

  it('renders the dashboard heading or welcome element', async () => {
    renderInRouter(<DashboardPage />);
    // Wait for loading to complete, then check for the dashboard heading.
    await waitFor(() => {
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });
  });
});

// ─── ProtectedRoute redirect behavior ────────────────────────────────────────

import App from '../App';

// App already contains BrowserRouter internally — do NOT wrap in another router.
// Use window.history.pushState to control the initial path before rendering.

describe('App routing — unauthenticated redirect', () => {
  beforeEach(() => {
    mockUseAuth.isAuthenticated = false;
    mockUseAuth.user = null;
  });

  it('shows login page when navigating to / unauthenticated', () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(screen.getByText('MedOps Console')).toBeTruthy();
  });

  it('shows login page when navigating to /members unauthenticated', () => {
    window.history.pushState({}, '', '/members');
    render(<App />);
    expect(screen.getByText('MedOps Console')).toBeTruthy();
  });

  it('shows login page when navigating to /skus unauthenticated', () => {
    window.history.pushState({}, '', '/skus');
    render(<App />);
    expect(screen.getByText('MedOps Console')).toBeTruthy();
  });
});

describe('App routing — authenticated access', () => {
  beforeEach(() => {
    mockUseAuth.isAuthenticated = true;
    mockUseAuth.user = { id: '1', username: 'admin', role: 'system_admin' };
  });

  it('does not show the login form when authenticated user visits /', () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    // Login page is identified by its username/password inputs, not just the heading
    // (Layout also has a "MedOps Console" heading, so we check for the form instead).
    expect(screen.queryByPlaceholderText(/username/i)).toBeNull();
  });

  it('redirects /login to dashboard when already authenticated', () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    // When authenticated, /login should redirect — the login form should not be visible.
    expect(screen.queryByPlaceholderText(/username/i)).toBeNull();
  });
});

// ─── WorkOrderDetailPage envelope parsing tests ───────────────────────────────

import WorkOrderDetailPage from '../components/workorders/WorkOrderDetailPage';

const baseWorkOrder = {
  id: 'wo-abc-123',
  submitted_by: 'uid-submitter',
  assigned_to: 'uid-tech',
  trade: 'electrical',
  priority: 'high' as const,
  sla_deadline: new Date(Date.now() + 86400000).toISOString(),
  status: 'submitted',
  description: 'Broken outlet in room 3',
  location: 'Building A, Room 303',
  parts_cost: 0,
  labor_cost: 0,
  created_at: new Date().toISOString(),
};

function renderDetailPage(woId = 'wo-abc-123') {
  return render(
    <MemoryRouter initialEntries={[`/work-orders/${woId}`]}>
      <Routes>
        <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkOrderDetailPage — API envelope parsing', () => {
  beforeEach(() => {
    mockUseAuth.isAuthenticated = true;
    mockUseAuth.user = { id: 'uid-submitter', username: 'submitter', role: 'front_desk' };
    mockWorkOrdersGet.mockReset();
  });

  it('renders order fields correctly when API returns new envelope {work_order, photos}', async () => {
    mockWorkOrdersGet.mockResolvedValueOnce({
      data: {
        work_order: baseWorkOrder,
        photos: [],
      },
    });

    renderDetailPage();

    await waitFor(() => {
      // Work order ID prefix should appear in the heading
      expect(screen.getByText(/wo-abc-1/i)).toBeTruthy();
    });
    // Priority badge
    expect(screen.getByText('high')).toBeTruthy();
    // Description
    expect(screen.getByText('Broken outlet in room 3')).toBeTruthy();
  });

  it('renders order fields correctly when API returns legacy plain WorkOrder', async () => {
    // Backward compatibility: bare WorkOrder object (no envelope)
    mockWorkOrdersGet.mockResolvedValueOnce({
      data: baseWorkOrder,
    });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/wo-abc-1/i)).toBeTruthy();
    });
    expect(screen.getByText('high')).toBeTruthy();
    expect(screen.getByText('Broken outlet in room 3')).toBeTruthy();
  });

  it('initializes rating from wo.rating in envelope response', async () => {
    const ratedWo = { ...baseWorkOrder, status: 'completed', rating: 4 };
    mockWorkOrdersGet.mockResolvedValueOnce({
      data: {
        work_order: ratedWo,
        photos: [],
      },
    });

    renderDetailPage();

    await waitFor(() => {
      // The "Rating: 4/5" text should appear since ratingSubmitted is true
      expect(screen.getByText(/rating.*4.*5/i)).toBeTruthy();
    });
  });

  it('shows error message when API call fails', async () => {
    mockWorkOrdersGet.mockRejectedValueOnce({
      response: { data: { error: 'Work order not found' } },
    });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/work order not found/i)).toBeTruthy();
    });
  });
});
