import React from 'react';
import { useClientSettings } from '@/hooks/useClientSettings';
import { useCookies } from 'next-client-cookies';

type IProps = {
  date: Date | string;
};

export const useDateFormat = () => {
  const cookies = useCookies();
  const { timeZone } = useClientSettings();

  const locale = cookies.get('tipi-locale') || 'en-US';

  const formatDate = (date?: Date | string) => {
    if (!date) return '';
    return new Date(date).toLocaleString(locale, { timeZone });
  };

  return formatDate;
};

export const DateFormat = ({ date }: IProps) => {
  const cookies = useCookies();
  const { timeZone } = useClientSettings();

  const locale = cookies.get('tipi-locale') || 'en-US';

  const formattedDate = new Date(date).toLocaleString(locale, { timeZone });

  return <>{formattedDate}</>;
};
