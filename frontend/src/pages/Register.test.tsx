import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import Register from './Register';

/* ------------------------------------------------------------------ */
/*  Mock authService                                                   */
/* ------------------------------------------------------------------ */

const mockRegister = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('../services/authService', () => ({
  register: (...args: unknown[]) => mockRegister(...args),
  AuthApiError: class AuthApiError extends Error {
    fields: { field: string; reason: string }[];
    isConflict: boolean;
    constructor(
      message: string,
      opts: { fields?: { field: string; reason: string }[]; isConflict?: boolean } = {},
    ) {
      super(message);
      this.name = 'AuthApiError';
      this.fields = opts.fields ?? [];
      this.isConflict = opts.isConflict ?? false;
    }
  },
  NetworkError: class NetworkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NetworkError';
    }
  },
}));

/* ------------------------------------------------------------------ */
/*  Mock react-router-dom                                              */
/* ------------------------------------------------------------------ */

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as object),
    useNavigate: vi.fn(),
  };
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderPage() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
}

function getInputs() {
  return {
    email: screen.getByLabelText('邮箱') as HTMLInputElement,
    username: screen.getByLabelText('用户名') as HTMLInputElement,
    password: screen.getByLabelText('密码') as HTMLInputElement,
    confirmPassword: screen.getByLabelText('确认密码') as HTMLInputElement,
  };
}

/** Fill all fields with valid data. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  const inputs = getInputs();
  await user.type(inputs.email, 'test@example.com');
  await user.type(inputs.username, 'testuser');
  await user.type(inputs.password, 'password123');
  await user.type(inputs.confirmPassword, 'password123');
  return inputs;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
});

describe('Register page', () => {
  /* ---------- Render ---------- */

  it('renders all form fields, submit button, and login link', () => {
    renderPage();

    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认密码')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /注册/ })).toBeInTheDocument();
    expect(screen.getByText('已有账号？')).toBeInTheDocument();
    expect(screen.getByText('去登录')).toBeInTheDocument();
  });

  /* ---------- Blur validation ---------- */

  it('shows error for empty email on blur', async () => {
    const user = userEvent.setup();
    renderPage();

    const { email } = getInputs();
    await user.click(email);
    await user.tab(); // blur

    await waitFor(() => {
      expect(screen.getByText('请输入邮箱')).toBeInTheDocument();
    });
  });

  it('shows error for invalid email format on blur', async () => {
    const user = userEvent.setup();
    renderPage();

    const { email } = getInputs();
    await user.type(email, 'not-an-email');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText('邮箱格式不正确')).toBeInTheDocument();
    });
  });

  it('shows error for password shorter than 8 chars on blur', async () => {
    const user = userEvent.setup();
    renderPage();

    const { password } = getInputs();
    await user.type(password, '123');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText('密码长度不能少于 8 位')).toBeInTheDocument();
    });
  });

  it('shows error for mismatched confirm password on blur', async () => {
    const user = userEvent.setup();
    renderPage();

    const { password, confirmPassword } = getInputs();
    await user.type(password, 'password123');
    await user.type(confirmPassword, 'different');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument();
    });
  });

  /* ---------- Submit success ---------- */

  it('navigates to /login on successful registration', async () => {
    const navigateFn = vi.fn();
    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(navigateFn);
    mockRegister.mockResolvedValueOnce({
      user_id: 'u1',
      email: 'test@example.com',
      username: 'testuser',
      created_at: '2026-01-01T00:00:00Z',
    });

    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: /注册/ }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      });
      expect(navigateFn).toHaveBeenCalledWith('/login');
    });
  });

  /* ---------- Submit 422 ---------- */

  it('displays server-side field errors on 422', async () => {
    const { AuthApiError } = await import('../services/authService');
    mockRegister.mockRejectedValueOnce(
      new AuthApiError('VALIDATION_ERROR', {
        fields: [{ field: 'email', reason: 'invalid format' }],
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: /注册/ }));

    await waitFor(() => {
      expect(screen.getByText('invalid format')).toBeInTheDocument();
    });
  });

  /* ---------- Submit 409 ---------- */

  it('displays conflict message with login link on 409', async () => {
    const { AuthApiError } = await import('../services/authService');
    mockRegister.mockRejectedValueOnce(
      new AuthApiError('EMAIL_ALREADY_EXISTS', { isConflict: true }),
    );

    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: /注册/ }));

    await waitFor(() => {
      // The conflict message is split across text + <a> element, use regex
      expect(screen.getByText(/该邮箱已注册，请直接/)).toBeInTheDocument();
      // There are two "去登录" links (conflict banner + form footer); verify both exist
      expect(screen.getAllByText('去登录')).toHaveLength(2);
    });
  });

  /* ---------- Network error ---------- */

  it('displays network error message on network failure', async () => {
    const { NetworkError } = await import('../services/authService');
    mockRegister.mockRejectedValueOnce(new NetworkError('网络连接异常，请稍后重试'));

    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: /注册/ }));

    await waitFor(() => {
      expect(screen.getByText('网络连接异常，请稍后重试')).toBeInTheDocument();
    });
  });

  /* ---------- Loading state ---------- */

  it('disables button and shows loading animation while submitting', async () => {
    // Resolve after a delay so we can catch the loading state
    mockRegister.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ user_id: 'u1', email: 'test@example.com', username: 'testuser', created_at: '2026-01-01T00:00:00Z' }), 200)),
    );

    const navigateFn = vi.fn();
    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(navigateFn);

    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    const submitBtn = screen.getByRole('button', { name: /注册/ });
    await user.click(submitBtn);

    // Button should be disabled while loading
    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText('注册中…')).toBeInTheDocument();
    });

    // After resolution, button should re-enable
    await waitFor(() => {
      expect(screen.getByText('注册')).toBeInTheDocument();
    });
  });
});
