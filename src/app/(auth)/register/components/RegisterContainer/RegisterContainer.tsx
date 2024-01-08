'use client';

import React from 'react';
import { useAction } from 'next-safe-action/hook';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { registerAction } from '@/actions/register/register-action';
import { RegisterForm } from '../RegisterForm';

export const RegisterContainer: React.FC = () => {
  const router = useRouter();

  const registerMutation = useAction(registerAction, {
    onError: (e) => {
      if (e.serverError) toast.error(e.serverError);
    },
    onSuccess: () => {
      router.push('/dashboard');
    },
  });

  return (
    <RegisterForm
      onSubmit={({ email, password }) => registerMutation.execute({ username: email, password })}
      loading={registerMutation.status === 'executing' || registerMutation.status === 'hasSucceeded'}
    />
  );
};
