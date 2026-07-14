import { useState, useCallback, useRef, type FormEvent } from 'react';
import type { AuthApiError, NetworkError as NetworkErrorType } from '../services/authService';
import { register } from '../services/authService';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface RegisterFormProps {
  /** Called after a successful registration (before redirect). */
  onSuccess: () => void;
}

type FieldName = 'email' | 'username' | 'password' | 'confirmPassword';

interface FormState {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

type FieldErrors = Partial<Record<FieldName, string>>;
type Touched = Partial<Record<FieldName, boolean>>;

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function validateField(name: FieldName, value: string, allValues: FormState): string {
  switch (name) {
    case 'email':
      if (!value.trim()) return '请输入邮箱';
      if (!EMAIL_RE.test(value.trim())) return '邮箱格式不正确';
      return '';

    case 'username':
      if (!value.trim()) return '请输入用户名';
      if (value.trim().length < 3 || value.trim().length > 20) return '用户名需为 3-20 个字符';
      if (!USERNAME_RE.test(value.trim())) return '仅支持字母、数字和下划线';
      return '';

    case 'password':
      if (!value) return '请输入密码';
      if (value.length < 8) return '密码长度不能少于 8 位';
      return '';

    case 'confirmPassword':
      if (!value) return '请确认密码';
      if (value !== allValues.password) return '两次输入的密码不一致';
      return '';

    default:
      return '';
  }
}

function validateAll(values: FormState): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of Object.keys(values) as FieldName[]) {
    const err = validateField(field, values[field], values);
    if (err) errors[field] = err;
  }
  return errors;
}

/** Return the label for each field, used in aria attributes. */
const FIELD_LABELS: Record<FieldName, string> = {
  email: '邮箱',
  username: '用户名',
  password: '密码',
  confirmPassword: '确认密码',
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [values, setValues] = useState<FormState>({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Touched>({});
  const [isLoading, setIsLoading] = useState(false);
  /** Error message shown at the top of the form (conflict / network). */
  const [globalError, setGlobalError] = useState<string | null>(null);
  /** Track if user has attempted submission (show all errors). */
  const [submitted, setSubmitted] = useState(false);

  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement>>>({});

  /* ---------- Blur handler: validate on blur ---------- */

  const handleBlur = useCallback(
    (field: FieldName) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      setErrors((prev) => ({
        ...prev,
        [field]: validateField(field, values[field], values),
      }));
    },
    [values],
  );

  /* ---------- Change handler: clear error while typing ---------- */

  const handleChange = useCallback(
    (field: FieldName, value: string) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      // Clear server-mapped errors for this field when user types
      setErrors((prev) => {
        if (prev[field]) {
          const next = { ...prev };
          delete next[field];
          return next;
        }
        return prev;
      });
      setGlobalError(null);
    },
    [],
  );

  /* ---------- Focus first error field ---------- */

  const focusFirstError = useCallback((fieldErrors: FieldErrors) => {
    const firstField = (['email', 'username', 'password', 'confirmPassword'] as FieldName[]).find(
      (f) => fieldErrors[f],
    );
    if (firstField && fieldRefs.current[firstField]) {
      fieldRefs.current[firstField]!.focus();
    }
  }, []);

  /* ---------- Submit ---------- */

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSubmitted(true);

      // Mark all fields as touched
      setTouched({ email: true, username: true, password: true, confirmPassword: true });

      // Full validation
      const fieldErrors = validateAll(values);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        focusFirstError(fieldErrors);
        return;
      }

      setIsLoading(true);
      setGlobalError(null);

      try {
        await register({
          email: values.email.trim(),
          username: values.username.trim(),
          password: values.password,
        });
        onSuccess();
      } catch (err: unknown) {
        const apiErr = err as AuthApiError | NetworkErrorType;

        if (apiErr.name === 'AuthApiError') {
          const authErr = apiErr as AuthApiError;
          if (authErr.isConflict) {
            // 409: show top-level message with login link
            setGlobalError('conflict');
          } else if (authErr.fields.length > 0) {
            // 422: map server field errors
            const serverErrors: FieldErrors = {};
            for (const fe of authErr.fields) {
              const fieldKey = fe.field as FieldName;
              if (fieldKey in values) {
                serverErrors[fieldKey] = fe.reason;
              }
            }
            setErrors((prev) => ({ ...prev, ...serverErrors }));
            focusFirstError(serverErrors);
          } else {
            setGlobalError(authErr.message || '注册失败，请稍后重试');
          }
        } else {
          // NetworkError
          setGlobalError('网络连接异常，请稍后重试');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [values, onSuccess, focusFirstError],
  );

  /* ---------- Render helpers ---------- */

  function renderFieldIcon(field: FieldName) {
    if (!touched[field] && !submitted) return null;
    if (errors[field]) return <span className="field-icon field-icon--error">✕</span>;
    if (values[field]) return <span className="field-icon field-icon--ok">✓</span>;
    return null;
  }

  return (
    <form className="register-form" onSubmit={handleSubmit} noValidate>
      {/* Global error banner */}
      {globalError === 'conflict' && (
        <div className="form-global-error" role="alert">
          该邮箱已注册，请直接
          <a href="/login" className="form-global-error__link">去登录</a>
        </div>
      )}
      {globalError && globalError !== 'conflict' && (
        <div className="form-global-error" role="alert">
          {globalError}
        </div>
      )}

      {/* Email */}
      <div className="form-field">
        <label htmlFor="register-email" className="form-label">邮箱</label>
        <div className="form-input-wrapper">
          <input
            ref={(el) => { fieldRefs.current.email = el ?? undefined; }}
            id="register-email"
            type="email"
            className={`form-input${errors.email && (touched.email || submitted) ? ' form-input--error' : ''}`}
            placeholder="请输入邮箱"
            autoComplete="email"
            value={values.email}
            onChange={(e) => handleChange('email', e.target.value)}
            onBlur={() => handleBlur('email')}
            disabled={isLoading}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {renderFieldIcon('email')}
        </div>
        {errors.email && (touched.email || submitted) && (
          <p id="email-error" className="form-field-error" role="alert">{errors.email}</p>
        )}
      </div>

      {/* Username */}
      <div className="form-field">
        <label htmlFor="register-username" className="form-label">用户名</label>
        <div className="form-input-wrapper">
          <input
            ref={(el) => { fieldRefs.current.username = el ?? undefined; }}
            id="register-username"
            type="text"
            className={`form-input${errors.username && (touched.username || submitted) ? ' form-input--error' : ''}`}
            placeholder="请输入用户名（3-20 位字母、数字或下划线）"
            autoComplete="username"
            value={values.username}
            onChange={(e) => handleChange('username', e.target.value)}
            onBlur={() => handleBlur('username')}
            disabled={isLoading}
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? 'username-error' : undefined}
          />
          {renderFieldIcon('username')}
        </div>
        {errors.username && (touched.username || submitted) && (
          <p id="username-error" className="form-field-error" role="alert">{errors.username}</p>
        )}
      </div>

      {/* Password */}
      <div className="form-field">
        <label htmlFor="register-password" className="form-label">密码</label>
        <div className="form-input-wrapper">
          <input
            ref={(el) => { fieldRefs.current.password = el ?? undefined; }}
            id="register-password"
            type="password"
            className={`form-input${errors.password && (touched.password || submitted) ? ' form-input--error' : ''}`}
            placeholder="请输入密码（至少 8 位）"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => handleChange('password', e.target.value)}
            onBlur={() => handleBlur('password')}
            disabled={isLoading}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          {renderFieldIcon('password')}
        </div>
        {errors.password && (touched.password || submitted) && (
          <p id="password-error" className="form-field-error" role="alert">{errors.password}</p>
        )}
      </div>

      {/* Confirm password */}
      <div className="form-field">
        <label htmlFor="register-confirm-password" className="form-label">确认密码</label>
        <div className="form-input-wrapper">
          <input
            ref={(el) => { fieldRefs.current.confirmPassword = el ?? undefined; }}
            id="register-confirm-password"
            type="password"
            className={`form-input${errors.confirmPassword && (touched.confirmPassword || submitted) ? ' form-input--error' : ''}`}
            placeholder="请再次输入密码"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(e) => handleChange('confirmPassword', e.target.value)}
            onBlur={() => handleBlur('confirmPassword')}
            disabled={isLoading}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
          />
          {renderFieldIcon('confirmPassword')}
        </div>
        {errors.confirmPassword && (touched.confirmPassword || submitted) && (
          <p id="confirm-password-error" className="form-field-error" role="alert">{errors.confirmPassword}</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        className={`form-submit${isLoading ? ' form-submit--loading' : ''}`}
        disabled={isLoading}
      >
        {isLoading && <span className="spinner" aria-hidden="true" />}
        {isLoading ? '注册中…' : '注册'}
      </button>

      {/* Login link */}
      <p className="form-footer">
        已有账号？<a href="/login">去登录</a>
      </p>
    </form>
  );
}
