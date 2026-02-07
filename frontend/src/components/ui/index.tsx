import React from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { Loader2, X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

// ============================================
// BUTTON
// ============================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-md hover:shadow-lg',
    secondary: 'bg-stone-200 text-stone-800 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={clsx(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
};

// ============================================
// INPUT
// ============================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={clsx(
              'w-full bg-white dark:bg-stone-900 border rounded-lg px-3 py-2',
              'text-stone-900 dark:text-stone-100',
              'placeholder:text-stone-400 dark:placeholder:text-stone-500',
              'transition-colors duration-150',
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-stone-300 dark:border-stone-700 focus:border-red-500',
              icon && 'pl-10',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// ============================================
// SELECT
// ============================================

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={clsx(
            'w-full bg-white dark:bg-stone-900 border rounded-lg px-3 py-2',
            'text-stone-900 dark:text-stone-100',
            'transition-colors duration-150',
            error
              ? 'border-red-500'
              : 'border-stone-300 dark:border-stone-700 focus:border-red-500',
            className
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

// ============================================
// CHECKBOX
// ============================================

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, ...props }, ref) => {
    return (
      <label className={clsx('inline-flex items-center gap-2 cursor-pointer', className)}>
        <input
          ref={ref}
          type="checkbox"
          className="w-4 h-4 rounded border-stone-300 text-red-600 focus:ring-red-500 dark:border-stone-600 dark:bg-stone-900"
          {...props}
        />
        {label && <span className="text-sm text-stone-700 dark:text-stone-300">{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

// ============================================
// CARD
// ============================================

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({ children, className, padding = 'md' }) => {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div
      className={clsx(
        'bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm',
        paddings[padding],
        className
      )}
    >
      {children}
    </div>
  );
};

// ============================================
// BADGE
// ============================================

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'red' | 'blue' | 'green' | 'yellow' | 'gray';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'gray', className }) => {
  const variants = {
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    yellow: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    gray: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
};

// ============================================
// MODAL
// ============================================

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdropClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdropClick = false,
}) => {
  const maxWidths = { sm: '24rem', md: '28rem', lg: '32rem', xl: '36rem' };

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}
        onClick={(e) => {
          if (closeOnBackdropClick && e.target === e.currentTarget) onClose();
        }}
      />

      {/* Modal panel */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: maxWidths[size],
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--color-surface, #ffffff)',
          borderRadius: '0.75rem',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
        className="dark:bg-stone-900"
      >
        {/* Header */}
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.5rem',
              borderBottom: '1px solid #e7e5e4',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
              {title}
            </h3>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.25rem',
                borderRadius: '0.5rem',
                color: '#a8a29e',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Close modal"
            >
              <X style={{ width: 20, height: 20 }} />
            </button>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '1.5rem', position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ============================================
// ALERT
// ============================================

interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  children,
  className,
}) => {
  const styles = {
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-300',
      icon: <Info className="w-5 h-5 text-blue-500" />,
    },
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-200 dark:border-emerald-800',
      text: 'text-emerald-800 dark:text-emerald-300',
      icon: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-800 dark:text-amber-300',
      icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-300',
      icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    },
  };

  const s = styles[type];

  return (
    <div
      className={clsx(
        'flex gap-3 p-4 rounded-lg border',
        s.bg,
        s.border,
        s.text,
        className
      )}
    >
      <div className="flex-shrink-0">{s.icon}</div>
      <div>
        {title && <h4 className="font-semibold mb-1">{title}</h4>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
};

// ============================================
// LOADING SPINNER
// ============================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <Loader2 className={clsx('animate-spin text-red-600', sizes[size], className)} />
  );
};

// ============================================
// AMOUNT DISPLAY
// ============================================

interface AmountProps {
  value: number;
  currency?: string;
  showSign?: boolean;
  className?: string;
}

export const Amount: React.FC<AmountProps> = ({
  value,
  currency = 'lei',
  showSign = false,
  className,
}) => {
  const isNegative = value < 0;
  const formatted = Math.abs(value).toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <span
      className={clsx(
        'font-mono tabular-nums',
        isNegative ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
        className
      )}
    >
      {showSign && (isNegative ? '-' : '+')}
      {formatted} {currency}
    </span>
  );
};

// ============================================
// EMPTY STATE
// ============================================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="mb-4 text-stone-300 dark:text-stone-600">{icon}</div>
      )}
      <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4 max-w-sm">
          {description}
        </p>
      )}
      {action}
    </div>
  );
};
