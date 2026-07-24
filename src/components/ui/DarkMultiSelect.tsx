import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  type DarkSelectMenuPlacement,
  type DarkSelectOption,
  resolveDarkSelectAutoPlacement,
} from '@/components/ui/DarkSelect';
import { useDarkSelectMenu } from '@/components/ui/useDarkSelectMenu';

export interface DarkMultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: DarkSelectOption[];
  disabledValues?: string[];
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  menuAlign?: 'left' | 'right';
  /** `auto` = flip ke atas bila ruang di bawah tidak cukup. */
  menuPlacement?: DarkSelectMenuPlacement;
  disabled?: boolean;
  showSelectAll?: boolean;
  selectAllLabel?: string;
  placeholder?: string;
  summaryLabel?: (count: number) => string;
  /** Tutup menu setelah user memilih satu opsi (default: true). */
  closeOnSelect?: boolean;
}

export function DarkMultiSelect({
  values,
  onChange,
  options,
  disabledValues = [],
  ariaLabel,
  className,
  triggerClassName,
  menuAlign = 'left',
  menuPlacement = 'down',
  disabled = false,
  showSelectAll = true,
  selectAllLabel = 'Select all',
  placeholder = 'Select…',
  summaryLabel,
  closeOnSelect = true,
}: DarkMultiSelectProps) {
  const { phase, isOpen, isVisible, close, toggle } = useDarkSelectMenu();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [resolvedPlacement, setResolvedPlacement] = useState<'up' | 'down'>(
    menuPlacement === 'up' ? 'up' : 'down',
  );
  const disabledSet = useMemo(() => new Set(disabledValues), [disabledValues]);

  const selectableOptions = useMemo(
    () => options.filter((opt) => !disabledSet.has(opt.value)),
    [disabledSet, options],
  );

  const selectedSet = useMemo(() => new Set(values), [values]);
  const allSelected =
    selectableOptions.length > 0 &&
    selectableOptions.every((opt) => selectedSet.has(opt.value));
  const someSelected = selectableOptions.some((opt) => selectedSet.has(opt.value));
  const menuOptionCount =
    options.length + (showSelectAll && selectableOptions.length > 1 ? 1 : 0);
  const dropUp = resolvedPlacement === 'up';

  const triggerLabel = useMemo(() => {
    if (values.length === 0) return placeholder;
    // Semua terpilih → pakai summary ("All") meski cuma 1 opsi
    if (summaryLabel && allSelected) return summaryLabel(values.length);
    if (values.length === 1) {
      return options.find((opt) => opt.value === values[0])?.label ?? values[0];
    }
    return summaryLabel ? summaryLabel(values.length) : `${values.length} selected`;
  }, [allSelected, options, placeholder, summaryLabel, values]);

  useEffect(() => {
    if (menuPlacement === 'auto') return;
    setResolvedPlacement(menuPlacement);
  }, [menuPlacement]);

  useEffect(() => {
    if (!isOpen || menuPlacement !== 'auto') return;
    const trigger = wrapRef.current?.querySelector<HTMLElement>('.dark-select-trigger');
    if (!trigger) return;
    setResolvedPlacement(resolveDarkSelectAutoPlacement(trigger, menuOptionCount));
  }, [isOpen, menuOptionCount, menuPlacement]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      close();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, isOpen]);

  function toggleValue(value: string) {
    if (disabledSet.has(value)) return;
    if (selectedSet.has(value)) {
      onChange(values.filter((entry) => entry !== value));
    } else {
      onChange([...values, value]);
    }
    if (closeOnSelect) close();
  }

  function toggleSelectAll() {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(selectableOptions.map((opt) => opt.value));
    }
    close();
  }

  function handleToggle() {
    if (disabled) return;
    if (!isOpen && menuPlacement === 'auto') {
      const trigger = wrapRef.current?.querySelector<HTMLElement>('.dark-select-trigger');
      if (trigger) {
        setResolvedPlacement(resolveDarkSelectAutoPlacement(trigger, menuOptionCount));
      }
    }
    toggle();
  }

  return (
    <div className={cn('dark-select-wrap dark-multi-select-wrap', className)} ref={wrapRef}>
      <button
        type="button"
        className={cn(
          'dark-select-trigger',
          triggerClassName,
          disabled && 'dark-select-trigger--disabled',
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={handleToggle}
      >
        <span className="dark-select-trigger-label">{triggerLabel}</span>
        <ChevronDown
          className={cn('dark-select-trigger-icon', isOpen && 'dark-select-trigger-icon--open')}
          aria-hidden
        />
      </button>
      {isVisible && !disabled ? (
        <ul
          className={cn(
            'dark-select-menu dark-multi-select-menu',
            menuAlign === 'right' && 'dark-select-menu--align-right',
            dropUp && 'dark-select-menu--drop-up',
            (phase === 'open' || phase === 'opening') && 'dark-select-menu--open',
            phase === 'closing' && 'dark-select-menu--closing',
          )}
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable
          onMouseDown={(event) => event.stopPropagation()}
        >
          {showSelectAll && selectableOptions.length > 1 ? (
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={allSelected}
                className={cn(
                  'dark-multi-select-menu-item',
                  allSelected && 'dark-multi-select-menu-item--active',
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  toggleSelectAll();
                }}
              >
                <span className="dark-multi-select-check" aria-hidden>
                  {allSelected ? <Check className="h-3 w-3" /> : someSelected ? '–' : null}
                </span>
                {selectAllLabel}
              </button>
            </li>
          ) : null}
          {options.map((opt) => {
            const optionDisabled = disabledSet.has(opt.value);
            const active = selectedSet.has(opt.value);
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-disabled={optionDisabled || undefined}
                  disabled={optionDisabled}
                  className={cn(
                    'dark-multi-select-menu-item',
                    active && 'dark-multi-select-menu-item--active',
                    optionDisabled && 'dark-multi-select-menu-item--disabled',
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    toggleValue(opt.value);
                  }}
                >
                  <span className="dark-multi-select-check" aria-hidden>
                    {active ? <Check className="h-3 w-3" /> : null}
                  </span>
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
