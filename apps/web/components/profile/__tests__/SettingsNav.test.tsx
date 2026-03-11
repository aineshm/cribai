import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsNav } from '../SettingsNav';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  User: () => <svg data-testid="user-icon" />,
  Bell: () => <svg data-testid="bell-icon" />,
  LogOut: () => <svg data-testid="logout-icon" />,
}));

describe('SettingsNav', () => {
  it('renders the "Personal Info" nav item', () => {
    render(
      <SettingsNav activeSection="personal" onSectionChange={vi.fn()} />
    );
    expect(screen.getByText('Personal Info')).toBeInTheDocument();
  });

  it('renders the "Notifications" nav item', () => {
    render(
      <SettingsNav activeSection="personal" onSectionChange={vi.fn()} />
    );
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('renders the "Log Out" nav item', () => {
    render(
      <SettingsNav activeSection="personal" onSectionChange={vi.fn()} />
    );
    expect(screen.getByText('Log Out')).toBeInTheDocument();
  });

  it('calls onSectionChange with "personal" when Personal Info is clicked', () => {
    const onSectionChange = vi.fn();
    render(
      <SettingsNav activeSection="notifications" onSectionChange={onSectionChange} />
    );
    fireEvent.click(screen.getByText('Personal Info'));
    expect(onSectionChange).toHaveBeenCalledWith('personal');
  });

  it('calls onSectionChange with "notifications" when Notifications is clicked', () => {
    const onSectionChange = vi.fn();
    render(
      <SettingsNav activeSection="personal" onSectionChange={onSectionChange} />
    );
    fireEvent.click(screen.getByText('Notifications'));
    expect(onSectionChange).toHaveBeenCalledWith('notifications');
  });

  it('calls onSectionChange with "logout" when Log Out is clicked', () => {
    const onSectionChange = vi.fn();
    render(
      <SettingsNav activeSection="personal" onSectionChange={onSectionChange} />
    );
    fireEvent.click(screen.getByText('Log Out'));
    expect(onSectionChange).toHaveBeenCalledWith('logout');
  });

  it('applies active styling to the current section button', () => {
    render(
      <SettingsNav activeSection="notifications" onSectionChange={vi.fn()} />
    );
    const notificationsButton = screen.getByText('Notifications').closest('button');
    expect(notificationsButton?.className).toContain('bg-primary/10');
    expect(notificationsButton?.className).toContain('text-primary');
  });

  it('does not apply active styling to inactive section buttons', () => {
    render(
      <SettingsNav activeSection="personal" onSectionChange={vi.fn()} />
    );
    const notificationsButton = screen.getByText('Notifications').closest('button');
    expect(notificationsButton?.className).not.toContain('bg-primary/10');
  });
});
