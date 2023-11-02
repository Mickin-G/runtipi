import React, { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Tooltip } from 'react-tooltip';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { type FormField, type AppInfo } from '@runtipi/shared';
import { Switch } from '@/components/ui/Switch';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { validateAppConfig } from '../../utils/validators';

interface IProps {
  formFields: FormField[];
  onSubmit: (values: FormValues) => void;
  initalValues?: { [key: string]: unknown };
  info: AppInfo;
  loading?: boolean;
}

export type FormValues = {
  exposed?: boolean;
  domain?: string;
  isVisibleOnGuestDashboard?: boolean;
  [key: string]: string | boolean | undefined;
};

const hiddenTypes = ['random'];
const typeFilter = (field: FormField) => !hiddenTypes.includes(field.type);

export const InstallForm: React.FC<IProps> = ({ formFields, info, onSubmit, initalValues, loading }) => {
  const t = useTranslations('apps.app-details.install-form');
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
    setError,
    control,
  } = useForm<FormValues>({});
  const watchExposed = watch('exposed', false);

  useEffect(() => {
    if (info.force_expose) {
      setValue('exposed', true);
    }
  }, [info.force_expose, setValue]);

  useEffect(() => {
    if (initalValues && !isDirty) {
      Object.entries(initalValues).forEach(([key, value]) => {
        setValue(key, value as string);
      });
    }
  }, [initalValues, isDirty, setValue]);

  const renderField = (field: FormField) => {
    const label = (
      <>
        {field.label}
        {field.required && <span className="ms-1 text-danger">*</span>}
        {Boolean(field.hint) && (
          <>
            <Tooltip anchorSelect={`.${field.env_variable}`}>{field.hint}</Tooltip>
            <span className={clsx('ms-1 form-help', field.env_variable)}>?</span>
          </>
        )}
      </>
    );

    if (field.type === 'boolean') {
      return (
        <Controller
          control={control}
          name={field.env_variable}
          defaultValue={field.default}
          render={({ field: { onChange, value, ref, ...props } }) => <Switch className="mb-3" ref={ref} checked={Boolean(value)} onCheckedChange={onChange} {...props} label={label} />}
        />
      );
    }

    if (Array.isArray(field.options)) {
      return (
        <Controller
          control={control}
          name={field.env_variable}
          defaultValue={field.default}
          render={({ field: { onChange, value, ref, ...props } }) => (
            <Select value={value as string} defaultValue={field.default as string} onValueChange={onChange} {...props}>
              <SelectTrigger className="mb-3" error={errors[field.env_variable]?.message} label={label}>
                <SelectValue placeholder={t('choose-option')} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );
    }

    return (
      <Input
        key={field.env_variable}
        {...register(field.env_variable)}
        label={label}
        error={errors[field.env_variable]?.message}
        disabled={loading}
        className="mb-3"
        placeholder={field.placeholder || field.label}
      />
    );
  };

  const renderExposeForm = () => (
    <>
      <Controller
        control={control}
        name="exposed"
        defaultValue={false}
        render={({ field: { onChange, value, ref, ...props } }) => (
          <Switch className="mb-3" disabled={info.force_expose} ref={ref} checked={value} onCheckedChange={onChange} {...props} label={t('expose-app')} />
        )}
      />
      {watchExposed && (
        <div className="mb-3">
          <Input {...register('domain')} label={t('domain-name')} error={errors.domain?.message} disabled={loading} placeholder={t('domain-name')} />
          <span className="text-muted">{t('domain-name-hint')}</span>
        </div>
      )}
    </>
  );

  const validate = (values: FormValues) => {
    const validationErrors = validateAppConfig(values, formFields);

    Object.entries(validationErrors).forEach(([key, value]) => {
      if (value) {
        setError(key, { message: value });
      }
    });

    if (Object.keys(validationErrors).length === 0) {
      onSubmit(values);
    }
  };

  return (
    <form className="flex flex-col" onSubmit={handleSubmit(validate)}>
      {formFields.filter(typeFilter).map(renderField)}
      <Controller
        control={control}
        name="isVisibleOnGuestDashboard"
        defaultValue={false}
        render={({ field: { onChange, value, ref, ...props } }) => (
          <Switch className="mb-3" disabled={info.force_expose} ref={ref} checked={value} onCheckedChange={onChange} {...props} label={t('display-on-guest-dashboard')} />
        )}
      />
      {info.exposable && renderExposeForm()}
      <Button loading={loading} type="submit" className="btn-success">
        {initalValues ? t('submit-update') : t('sumbit-install')}
      </Button>
    </form>
  );
};
