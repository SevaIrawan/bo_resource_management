import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useDarkSelectMenu } from '@/components/ui/useDarkSelectMenu';

export interface DarkSelectOption {
  value: string;
  label: string;
}

export type DarkSelectMenuPlacement = 'down' | 'up' | 'auto';

export interface DarkSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  disabledValues?: string[];
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  menuAlign?: 'left' | 'right';
  /** `auto` = flip ke atas bila ruang di bawah (viewport / clip container) tidak cukup. */
  menuPlacement?: DarkSelectMenuPlacement;
  /** Batasi tinggi menu (row terlihat); sisanya scroll. Default: tanpa batas row (CSS max-height tetap berlaku). */
  menuMaxRows?: number;
  disabled?: boolean;
}

const MENU_ITEM_EST_PX = 26;
const MENU_PAD_EST_PX = 8;
const MENU_GAP_EST_PX = 8;
const DEFAULT_MENU_MAX_ROWS = 6;

function estimateMenuHeight(optionCount: number, maxRows = DEFAULT_MENU_MAX_ROWS): number {
  const rows = Math.min(Math.max(optionCount, 1), maxRows);
  return rows * MENU_ITEM_EST_PX + MENU_PAD_EST_PX + MENU_GAP_EST_PX;
}

function resolveClipRect(trigger: HTMLElement): DOMRect {
  const clip = trigger.closest(
    '.brand-card-body, .brand-card, .content-area-body, [data-dark-select-clip]',
  ) as HTMLElement | null;
  if (clip) return clip.getBoundingClientRect();
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function resolveAutoPlacement(
  trigger: HTMLElement,
  optionCount: number,
  maxRows = DEFAULT_MENU_MAX_ROWS,
): 'up' | 'down' {
  const rect = trigger.getBoundingClientRect();
  const clip = resolveClipRect(trigger);
  const needed = estimateMenuHeight(optionCount, maxRows);
  const spaceBelow = Math.min(clip.bottom, window.innerHeight) - rect.bottom;
  const spaceAbove = rect.top - Math.max(clip.top, 0);
  if (spaceBelow >= needed) return 'down';
  if (spaceAbove > spaceBelow) return 'up';
  return 'down';
}

/** Dipakai DarkSelect + DarkMultiSelect (hybrid flip up/down). */
export function resolveDarkSelectAutoPlacement(
  trigger: HTMLElement,
  optionCount: number,
  maxRows = DEFAULT_MENU_MAX_ROWS,
): 'up' | 'down' {
  return resolveAutoPlacement(trigger, optionCount, maxRows);
}

export function DarkSelect({
  value,
  onChange,
  options,
  disabledValues = [],
  placeholder,
  id,
  ariaLabel,
  className,
  triggerClassName,
  menuClassName,
  menuAlign = 'left',
  menuPlacement = 'down',
  menuMaxRows = DEFAULT_MENU_MAX_ROWS,
  disabled = false,
}: DarkSelectProps) {
  const { phase, isOpen, isVisible, close, toggle } = useDarkSelectMenu();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [resolvedPlacement, setResolvedPlacement] = useState<'up' | 'down'>(
    menuPlacement === 'up' ? 'up' : 'down',
  );
  const disabledSet = new Set(disabledValues);
  const selected = options.find((opt) => opt.value === value);
  const showPlaceholder = !selected && !value;
  const triggerLabel = selected?.label ?? placeholder ?? value;
  const dropUp = resolvedPlacement === 'up';
  const maxRows = Math.max(1, menuMaxRows);

  useEffect(() => {
    if (menuPlacement === 'auto') return;
    setResolvedPlacement(menuPlacement);
  }, [menuPlacement]);

  useEffect(() => {
    if (!isOpen || menuPlacement !== 'auto') return;
    const trigger = wrapRef.current?.querySelector<HTMLElement>('.dark-select-trigger');
    if (!trigger) return;
    setResolvedPlacement(resolveAutoPlacement(trigger, options.length, maxRows));
  }, [isOpen, menuPlacement, maxRows, options.length]);

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

  function selectOption(next: string) {
    close();
    if (next !== value) onChange(next);
  }

  function handleToggle() {
    if (disabled) return;
    if (!isOpen && menuPlacement === 'auto') {
      const trigger = wrapRef.current?.querySelector<HTMLElement>('.dark-select-trigger');
      if (trigger) {
        setResolvedPlacement(resolveAutoPlacement(trigger, options.length, maxRows));
      }
    }
    toggle();
  }

  return (
    <div className={cn('dark-select-wrap', className)} ref={wrapRef}>
      <button
        type="button"
        id={id}
        className={cn('dark-select-trigger', triggerClassName, disabled && 'dark-select-trigger--disabled')}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={handleToggle}
      >
        <span
          className={cn(
            'dark-select-trigger-label',
            showPlaceholder && 'dark-select-trigger-label--placeholder',
          )}
        >
          {triggerLabel}
        </span>
        <ChevronDown
          className={cn('dark-select-trigger-icon', isOpen && 'dark-select-trigger-icon--open')}
          aria-hidden
        />
      </button>
      {isVisible && !disabled ? (
        <ul
          className={cn(
            'dark-select-menu',
            menuAlign === 'right' && 'dark-select-menu--align-right',
            dropUp && 'dark-select-menu--drop-up',
            (phase === 'open' || phase === 'opening') && 'dark-select-menu--open',
            phase === 'closing' && 'dark-select-menu--closing',
            menuClassName,
          )}
          style={{ ['--dark-select-menu-rows' as string]: String(maxRows) }}
          role="listbox"
          aria-label={ariaLabel}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {options.map((opt) => {
            const optionDisabled = disabledSet.has(opt.value);
            return (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                aria-disabled={optionDisabled || undefined}
                disabled={optionDisabled}
                className={cn(
                  'dark-select-menu-item',
                  value === opt.value && 'dark-select-menu-item--active',
                  optionDisabled && 'dark-select-menu-item--disabled',
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (optionDisabled) return;
                  selectOption(opt.value);
                }}
              >
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
