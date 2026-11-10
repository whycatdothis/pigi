// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../testing/jsdomSetup';
import { ProjectPicker } from './projectPicker';

const projects = [
  { path: '/repo/alpha', name: 'alpha' },
  { path: '/repo/beta', name: 'beta' },
];

afterEach(cleanup);

describe('ProjectPicker', () => {
  it('searches and selects a project from the sidebar title', async () => {
    const onSelectProject = vi.fn();
    render(
      <ProjectPicker
        variant="sidebarTitle"
        projectName="alpha"
        selectedProjectPath="/repo/alpha"
        recentProjects={projects}
        onSelectProject={onSelectProject}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch project (alpha)' }));
    const search = await screen.findByPlaceholderText('Search projects');
    fireEvent.change(search, { target: { value: 'beta' } });

    fireEvent.click(await screen.findByRole('option', { name: /beta/ }));

    expect(onSelectProject).toHaveBeenCalledWith('/repo/beta');
    expect(screen.queryByPlaceholderText('Search projects')).toBeNull();
  });

  it('clears the search when closed without a selection', async () => {
    render(
      <ProjectPicker
        variant="sidebarTitle"
        projectName="alpha"
        selectedProjectPath="/repo/alpha"
        recentProjects={projects}
        onSelectProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch project (alpha)' }));
    const search = await screen.findByPlaceholderText('Search projects');
    fireEvent.change(search, { target: { value: 'beta' } });
    fireEvent.keyDown(search, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Switch project (alpha)' }));
    expect(await screen.findByPlaceholderText('Search projects')).toHaveValue('');
    expect(await screen.findByRole('option', { name: /alpha/ })).toBeInTheDocument();
  });
});
