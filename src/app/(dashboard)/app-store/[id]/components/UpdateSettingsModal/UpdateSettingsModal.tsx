import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader } from '@/components/ui/Dialog';
import { useTranslations } from 'next-intl';
import { AppInfo } from '@runtipi/shared';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { InstallForm, type FormValues } from '../InstallForm';

interface IProps {
  info: AppInfo;
  config: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}

export const UpdateSettingsModal: React.FC<IProps> = ({ info, config, isOpen, onClose, onSubmit }) => {
  const t = useTranslations('apps.app-details.update-settings-form');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <h5 className="modal-title">{t('title', { name: info.name })}</h5>
        </DialogHeader>
        <ScrollArea maxHeight={500}>
          <DialogDescription>
            <InstallForm onSubmit={onSubmit} formFields={info.form_fields} info={info} initalValues={{ ...config }} />
          </DialogDescription>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
