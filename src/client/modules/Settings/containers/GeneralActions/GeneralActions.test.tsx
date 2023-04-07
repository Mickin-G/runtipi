import React from 'react';
import { useToastStore } from '@/client/state/toastStore';
import { getTRPCMock, getTRPCMockError } from '@/client/mocks/getTrpcMock';
import { server } from '@/client/mocks/server';
import { GeneralActions } from './GeneralActions';
import { fireEvent, render, renderHook, screen, waitFor } from '../../../../../../tests/test-utils';

describe('Test: GeneralActions', () => {
  it('should render without error', () => {
    render(<GeneralActions />);

    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('should show toast if update mutation fails', async () => {
    // arrange
    const { result } = renderHook(() => useToastStore());
    server.use(getTRPCMock({ path: ['system', 'getVersion'], response: { current: '1.0.0', latest: '2.0.0' } }));
    server.use(getTRPCMockError({ path: ['system', 'update'], type: 'mutation', status: 500, message: 'Something went wrong' }));
    render(<GeneralActions />);
    await waitFor(() => {
      expect(screen.getByText('Update to 2.0.0')).toBeInTheDocument();
    });
    const updateButton = screen.getByRole('button', { name: /Update/i });
    fireEvent.click(updateButton);

    // act
    const updateButtonModal = screen.getByRole('button', { name: /Update/i });
    fireEvent.click(updateButtonModal);

    // assert
    await waitFor(() => {
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].status).toEqual('error');
      expect(result.current.toasts[0].title).toEqual('Error');
      expect(result.current.toasts[0].description).toEqual('Something went wrong');
    });
  });

  it('should log user out if update is successful', async () => {
    // arrange
    localStorage.setItem('token', '123');
    server.use(getTRPCMock({ path: ['system', 'getVersion'], response: { current: '1.0.0', latest: '2.0.0' } }));
    server.use(getTRPCMock({ path: ['system', 'update'], response: true }));
    render(<GeneralActions />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update to 2.0.0' })).toBeInTheDocument();
    });
    const updateButton = screen.getByRole('button', { name: /Update to 2.0.0/i });
    fireEvent.click(updateButton);

    // act
    const updateButtonModal = screen.getByRole('button', { name: /Update/i });
    fireEvent.click(updateButtonModal);

    // assert
    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  it('should show toast if restart mutation fails', async () => {
    // arrange
    const { result } = renderHook(() => useToastStore());
    server.use(getTRPCMockError({ path: ['system', 'restart'], type: 'mutation', status: 500, message: 'Something went wrong' }));
    render(<GeneralActions />);
    const restartButton = screen.getByRole('button', { name: /Restart/i });

    // act
    fireEvent.click(restartButton);
    const restartButtonModal = screen.getByRole('button', { name: /Restart/i });
    fireEvent.click(restartButtonModal);

    // assert
    await waitFor(() => {
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].status).toEqual('error');
      expect(result.current.toasts[0].title).toEqual('Error');
      expect(result.current.toasts[0].description).toEqual('Something went wrong');
    });
  });

  it('should log user out if restart is successful', async () => {
    // arrange
    localStorage.setItem('token', '1234');
    server.use(getTRPCMock({ path: ['system', 'restart'], response: true }));
    render(<GeneralActions />);

    // Find button near the top of the page
    const restartButton = screen.getByRole('button', { name: /Restart/i });

    // act
    fireEvent.click(restartButton);
    const restartButtonModal = screen.getByRole('button', { name: /Restart/i });
    fireEvent.click(restartButtonModal);

    // assert
    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull();
    });
  });
});
