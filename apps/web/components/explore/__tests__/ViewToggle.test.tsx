import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle', () => {
  it('renders List and Map radio buttons', () => {
    render(<ViewToggle activeView="list" onViewChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /list view/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /map view/i })).toBeInTheDocument();
  });

  it('has a radiogroup with correct aria-label', () => {
    render(<ViewToggle activeView="list" onViewChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: /view mode/i })).toBeInTheDocument();
  });

  it('active view has aria-checked="true"', () => {
    render(<ViewToggle activeView="list" onViewChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /list view/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /map view/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('inactive view has aria-checked="false"', () => {
    render(<ViewToggle activeView="map" onViewChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /map view/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /list view/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking Map calls onViewChange with "map"', () => {
    const onViewChange = vi.fn();
    render(<ViewToggle activeView="list" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /map view/i }));
    expect(onViewChange).toHaveBeenCalledWith('map');
  });

  it('clicking List calls onViewChange with "list"', () => {
    const onViewChange = vi.fn();
    render(<ViewToggle activeView="map" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /list view/i }));
    expect(onViewChange).toHaveBeenCalledWith('list');
  });

  it('clicking the already-active view still calls onViewChange', () => {
    const onViewChange = vi.fn();
    render(<ViewToggle activeView="list" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /list view/i }));
    expect(onViewChange).toHaveBeenCalledWith('list');
  });
});
